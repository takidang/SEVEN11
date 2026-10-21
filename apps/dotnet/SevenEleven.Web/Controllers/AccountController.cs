using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;
using SevenEleven.Web.Models.Shop;

namespace SevenEleven.Web.Controllers;

/// <summary>
/// Đăng nhập / đăng ký (/dang-nhap) và trang tài khoản (/tai-khoan) của khách. Đăng nhập hằng ngày bằng
/// số điện thoại + mật khẩu; OTP chỉ để chứng minh chủ số điện thoại khi đăng ký và khi quên mật khẩu
/// (cũng là cách khách đăng ký tại quầy tự tạo mật khẩu).
/// </summary>
public class AccountController(
    AppDbContext db, LoyaltyService loyalty, CartStore cart, OtpService otp, CustomerAdminService customers, PasswordService passwords, ShopContext shop)
    : ShopController(db)
{
    public const int PasswordMinLength = 6;
    public const int PasswordMaxLength = 64;
    public const string DemoPhone = "0901234567";

    private const string FlowKey = "auth.flow";
    private const string SignUpKey = "auth.signup";
    private const string FormKey = "AuthForm";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // ================================================================== đăng nhập / đăng ký

    [HttpGet]
    public Task<IActionResult> Login(string? tab, string? next, string? returnUrl, string? buoc, string? sdt, string? sms) =>
        SignInPageAsync(tab == "dang-ky", next ?? returnUrl, buoc, sdt, sms == "1");

    [HttpGet]
    public Task<IActionResult> Register(string? next, string? returnUrl, string? sdt) =>
        SignInPageAsync(true, next ?? returnUrl, null, sdt, false);

    private async Task<IActionResult> SignInPageAsync(bool signUp, string? nextRaw, string? buoc, string? sdt, bool showSms)
    {
        var next = ShopUrls.SafeNext(nextRaw);
        if (User.CustomerId() is not null && shop.Customer is not null) return LocalRedirect(next);

        var form = TempData[FormKey] is string json ? JsonSerializer.Deserialize<AuthFormState>(json, JsonOptions) : null;
        var flow = ReadFlow();
        var step = AuthStep.Form;
        if (buoc == "quen-mat-khau") step = AuthStep.Forgot;
        else if (buoc == "xac-minh" && flow?.Step == "otp") step = AuthStep.Otp;
        else if (buoc == "mat-khau-moi" && flow?.Step == "new-password") step = AuthStep.NewPassword;

        var now = DateTime.Now;
        var pending = ReadSignUp();
        if (step == AuthStep.Otp && showSms && flow is not null)
            Toasts.Add(TempData, SmsToast(flow.Phone, flow.DevCode));
        ViewData["Title"] = step switch
        {
            AuthStep.Forgot => "Quên mật khẩu",
            AuthStep.Otp => "Xác minh số điện thoại",
            AuthStep.NewPassword => "Đặt mật khẩu mới",
            _ => signUp ? "Đăng ký thành viên" : "Đăng nhập thành viên",
        };

        var errors = new FormErrors();
        if (form is not null) foreach (var (k, v) in form.Errors) errors.Set(k, v);
        return View("Login", new SignInModel
        {
            SignUp = signUp,
            Step = step,
            Next = next,
            Phone = form?.Phone ?? sdt ?? (signUp ? pending?.Phone : null),
            FullName = form?.FullName ?? (signUp ? pending?.FullName : null),
            Errors = errors,
            Problem = form?.Problem ?? AuthProblem.None,
            ProblemPhone = form?.ProblemPhone,
            Flow = step is AuthStep.Otp or AuthStep.NewPassword ? flow : null,
            ResendLeft = flow is null ? 0 : Math.Max(0, OtpService.ResendSeconds - (int)(now - flow.SentAt).TotalSeconds),
            OtpError = flow?.Error,
            OtpBlocked = flow?.Blocked == true,
            Demo = await Db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Phone == DemoPhone),
        });
    }

    /// <summary>Tab "Đăng nhập": số điện thoại + mật khẩu, không cần OTP.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(string? phone, string? password, string? next, string? returnUrl)
    {
        var target = ShopUrls.SafeNext(next ?? returnUrl);
        var normalized = Phone.Normalize(phone);
        var errors = new FormErrors();
        ValidatePhone(phone, normalized, errors);
        if (string.IsNullOrEmpty(password)) errors.Set("password", "Nhập mật khẩu");
        if (errors.Count > 0) return BackToForm(false, target, new AuthFormState { Phone = phone, Errors = errors });

        var customer = await Db.Customers.FirstOrDefaultAsync(c => c.Phone == normalized);
        if (customer is null)
            return BackToForm(false, target, new AuthFormState { Phone = phone, Problem = AuthProblem.NotRegistered, ProblemPhone = normalized });
        if (customer.PasswordHash is null)
            return BackToForm(false, target, new AuthFormState { Phone = phone, Problem = AuthProblem.NoPassword, ProblemPhone = normalized });
        if (!PasswordHasher.Verify(password!, customer.PasswordHash))
            return BackToForm(false, target, new AuthFormState { Phone = phone, Errors = new FormErrors { ["password"] = "Mật khẩu không đúng" } });

        await SignInCustomerAsync(customer);
        ClearFlow();
        this.Toast($"Chào mừng {customer.FullName} quay lại");
        return LocalRedirect(target);
    }

    /// <summary>Tab "Đăng ký": họ tên, số điện thoại, mật khẩu → gửi OTP chứng minh chủ số điện thoại.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Register(string? fullName, string? phone, string? password, string? confirm, string? next)
    {
        var target = ShopUrls.SafeNext(next);
        var name = (fullName ?? "").Trim();
        var normalized = Phone.Normalize(phone);
        var errors = new FormErrors();
        if (name.Length < 2) errors.Set("fullName", "Nhập họ và tên của bạn");
        else if (name.Length > 60) errors.Set("fullName", "Họ tên tối đa 60 ký tự");
        ValidatePhone(phone, normalized, errors);
        ValidateNewPassword(password, confirm, errors);
        var state = new AuthFormState { Phone = phone, FullName = fullName, Errors = errors };
        if (errors.Count > 0) return BackToForm(true, target, state);

        if (await Db.Customers.AnyAsync(c => c.Phone == normalized))
            return BackToForm(true, target, new AuthFormState { Phone = phone, FullName = fullName, Problem = AuthProblem.AlreadyMember, ProblemPhone = normalized });

        WriteSignUp(new PendingSignUp { FullName = name, Phone = normalized, PasswordHash = PasswordHasher.Hash(password!) });
        SendOtp(normalized, OtpPurpose.SignUp);
        return Redirect($"{ShopUrls.SignIn}?buoc=xac-minh&next={Uri.EscapeDataString(target)}");
    }

    /// <summary>"Quên mật khẩu" (và "Tạo mật khẩu" của khách đăng ký tại quầy): số điện thoại → OTP.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Forgot(string? phone, string? next)
    {
        var target = ShopUrls.SafeNext(next);
        var normalized = Phone.Normalize(phone);
        var errors = new FormErrors();
        ValidatePhone(phone, normalized, errors);
        if (errors.Count > 0) return BackToStep("quen-mat-khau", target, new AuthFormState { Phone = phone, Errors = errors });
        if (!await Db.Customers.AnyAsync(c => c.Phone == normalized))
            return BackToStep("quen-mat-khau", target, new AuthFormState { Phone = phone, Problem = AuthProblem.Unknown, ProblemPhone = normalized });

        SendOtp(normalized, OtpPurpose.Reset);
        return Redirect($"{ShopUrls.SignIn}?buoc=xac-minh&next={Uri.EscapeDataString(target)}");
    }

    /// <summary>Kiểm tra mã OTP 6 số: đúng thì tạo tài khoản (đăng ký) hoặc sang bước đặt mật khẩu mới.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> VerifyOtp([FromForm(Name = "otp")] string[]? digits, string? code, string? next)
    {
        var target = ShopUrls.SafeNext(next);
        var flow = ReadFlow();
        if (flow is null || flow.Step != "otp")
        {
            this.ToastError("Phiên xác minh đã hết, vui lòng nhập lại");
            return Redirect(ShopUrls.SignIn);
        }
        var value = code ?? string.Concat((digits ?? []).Select(d => (d ?? "").Trim()));
        var purpose = flow.Purpose == "reset" ? OtpPurpose.Reset : OtpPurpose.SignUp;
        var result = otp.Verify(flow.Phone, purpose, value, DateTime.Now);
        if (!result.Ok)
        {
            // Sai mã thì còn thử tiếp được; mã hết hạn hoặc sai quá 5 lần thì chỉ còn cách xin mã mới.
            flow.Error = result.Error;
            flow.Blocked = result.Error?.StartsWith("Mã OTP không đúng") != true;
            WriteFlow(flow);
            return Redirect($"{ShopUrls.SignIn}?buoc=xac-minh&next={Uri.EscapeDataString(target)}");
        }

        if (purpose == OtpPurpose.Reset)
        {
            flow.Step = "new-password";
            WriteFlow(flow);
            return Redirect($"{ShopUrls.SignIn}?buoc=mat-khau-moi&next={Uri.EscapeDataString(target)}");
        }

        var pending = ReadSignUp();
        if (pending is null || pending.Phone != flow.Phone)
        {
            ClearFlow();
            this.ToastError("Phiên đăng ký đã hết, vui lòng nhập lại");
            return Redirect($"{ShopUrls.SignIn}?tab=dang-ky&next={Uri.EscapeDataString(target)}");
        }
        if (await Db.Customers.AnyAsync(c => c.Phone == pending.Phone))
        {
            ClearFlow();
            return BackToForm(true, target, new AuthFormState { Phone = pending.Phone, FullName = pending.FullName, Problem = AuthProblem.AlreadyMember, ProblemPhone = pending.Phone });
        }

        var now = DateTime.Now;
        var customer = new Customer
        {
            Id = $"cu-{Guid.NewGuid():N}"[..11],
            FullName = pending.FullName,
            Phone = pending.Phone,
            Tier = MemberTier.Bronze,
            TierSince = now,
            ReviewedMonth = MembershipService.MonthKey(now.AddMonths(-1)),
            JoinedAt = now,
            PasswordHash = pending.PasswordHash,
        };
        Db.Customers.Add(customer);
        await Db.SaveChangesAsync();
        await SignInCustomerAsync(customer);
        ClearFlow();
        this.Toast("Tạo tài khoản thành công", $"Chào {customer.FullName}, bạn đang là thành viên hạng {MembershipService.Info(customer.Tier).Label}.");
        return LocalRedirect(target);
    }

    /// <summary>"Gửi lại mã": trong 60 giây đầu mã cũ còn dùng được thì gửi lại đúng mã đó.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult ResendOtp(string? next)
    {
        var target = ShopUrls.SafeNext(next);
        var flow = ReadFlow();
        if (flow is null || flow.Step != "otp") return Redirect(ShopUrls.SignIn);
        SendOtp(flow.Phone, flow.Purpose == "reset" ? OtpPurpose.Reset : OtpPurpose.SignUp);
        return Redirect($"{ShopUrls.SignIn}?buoc=xac-minh&next={Uri.EscapeDataString(target)}");
    }

    /// <summary>Bước cuối của "Quên mật khẩu": số điện thoại đã qua OTP → đặt mật khẩu mới và đăng nhập.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> NewPassword(string? password, string? confirm, string? next)
    {
        var target = ShopUrls.SafeNext(next);
        var flow = ReadFlow();
        if (flow is null || flow.Step != "new-password")
        {
            this.ToastError("Phiên xác minh đã hết, vui lòng nhập lại");
            return Redirect($"{ShopUrls.SignIn}?buoc=quen-mat-khau");
        }
        var errors = new FormErrors();
        ValidateNewPassword(password, confirm, errors);
        if (errors.Count > 0) return BackToStep("mat-khau-moi", target, new AuthFormState { Errors = errors });

        var customer = await Db.Customers.FirstOrDefaultAsync(c => c.Phone == flow.Phone);
        if (customer is null)
        {
            ClearFlow();
            this.ToastError("Số điện thoại chưa đăng ký thành viên");
            return Redirect(ShopUrls.SignIn);
        }
        customer.PasswordHash = PasswordHasher.Hash(password!);
        await Db.SaveChangesAsync();
        await SignInCustomerAsync(customer);
        ClearFlow();
        this.Toast("Đã đặt mật khẩu mới", $"Chào {customer.FullName}, bạn đã đăng nhập.");
        return LocalRedirect(target);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        this.Toast("Đã đăng xuất khỏi tài khoản");
        return Redirect("/");
    }

    private void SendOtp(string phone, OtpPurpose purpose)
    {
        var now = DateTime.Now;
        var sent = otp.Request(phone, purpose, now);
        WriteFlow(new AuthFlowState
        {
            Step = "otp",
            Purpose = purpose == OtpPurpose.Reset ? "reset" : "sign-up",
            Phone = phone,
            SentAt = sent.SentAt,
            DevCode = sent.DevCode,
        });
        // Bản demo không gửi SMS thật: mã hiện trong một thông báo giống tin nhắn.
        Toasts.Add(TempData, SmsToast(phone, sent.DevCode));
    }

    private static Toast SmsToast(string phone, string code) =>
        new($"SMS giả lập tới {Fmt.Phone(phone)}", code, "sms", Duration: 30_000);

    private static void ValidatePhone(string? raw, string normalized, FormErrors errors)
    {
        if (string.IsNullOrWhiteSpace(raw)) errors.Set("phone", "Nhập số điện thoại");
        else if (!System.Text.RegularExpressions.Regex.IsMatch(raw.Trim(), @"^[\d\s.+-]+$") || !Phone.IsValid(normalized)) errors.Set("phone", Phone.Rule);
    }

    private static void ValidateNewPassword(string? password, string? confirm, FormErrors errors)
    {
        if ((password ?? "").Length < PasswordMinLength) errors.Set("password", $"Mật khẩu tối thiểu {PasswordMinLength} ký tự");
        else if (password!.Length > PasswordMaxLength) errors.Set("password", $"Mật khẩu tối đa {PasswordMaxLength} ký tự");
        if (string.IsNullOrEmpty(confirm)) errors.Set("confirm", "Nhập lại mật khẩu");
        else if (confirm != password) errors.Set("confirm", "Mật khẩu nhập lại không khớp");
    }

    private RedirectResult BackToForm(bool signUp, string next, AuthFormState state)
    {
        TempData[FormKey] = JsonSerializer.Serialize(state, JsonOptions);
        return Redirect($"{ShopUrls.SignIn}?{(signUp ? "tab=dang-ky&" : "")}next={Uri.EscapeDataString(next)}");
    }

    private RedirectResult BackToStep(string step, string next, AuthFormState state)
    {
        TempData[FormKey] = JsonSerializer.Serialize(state, JsonOptions);
        return Redirect($"{ShopUrls.SignIn}?buoc={step}&next={Uri.EscapeDataString(next)}");
    }

    private AuthFlowState? ReadFlow() =>
        HttpContext.Session.GetString(FlowKey) is string json ? JsonSerializer.Deserialize<AuthFlowState>(json, JsonOptions) : null;

    private void WriteFlow(AuthFlowState flow) => HttpContext.Session.SetString(FlowKey, JsonSerializer.Serialize(flow, JsonOptions));

    private PendingSignUp? ReadSignUp() =>
        HttpContext.Session.GetString(SignUpKey) is string json ? JsonSerializer.Deserialize<PendingSignUp>(json, JsonOptions) : null;

    private void WriteSignUp(PendingSignUp pending) => HttpContext.Session.SetString(SignUpKey, JsonSerializer.Serialize(pending, JsonOptions));

    private void ClearFlow()
    {
        HttpContext.Session.Remove(FlowKey);
        HttpContext.Session.Remove(SignUpKey);
    }

    // ================================================================== trang tài khoản

    /// <summary>Tài khoản: thẻ thành viên ở mọi tab; tab Tổng quan, Hạng, Sao vàng, Đơn hàng, Địa chỉ, Thông tin.</summary>
    [Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> Index(string? tab, string? loc, int? so, int? sao)
    {
        var id = User.CustomerId()!;
        var customer = await Db.Customers.AsNoTracking().Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null)
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Redirect(ShopUrls.SignIn);
        }

        var now = shop.Now;
        var current = AccountModel.Tabs.Any(t => t.Key == tab) ? tab! : "tong-quan";
        var orders = await Db.Orders.AsNoTracking()
            .Where(o => o.CustomerId == id)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Store)
            .OrderByDescending(o => o.CreatedAt)
            .AsSplitQuery()
            .ToListAsync();
        var spend = (await customers.MonthSpendAsync(now, [id])).GetValueOrDefault(id);
        var starQuery = Db.StarEntries.AsNoTracking().Where(e => e.CustomerId == id);
        var starLimit = Math.Clamp(sao ?? AccountModel.StarPage, AccountModel.StarPage, 500);
        var promotions = shop.Promotions;

        var profile = TempData["ProfileForm"] is string json ? JsonSerializer.Deserialize<ProfileFormState>(json, JsonOptions) : null;
        var passwordErrors = TempData["PasswordForm"] is string pw ? JsonSerializer.Deserialize<Dictionary<string, string>>(pw, JsonOptions) : null;
        ViewData["Title"] = "Tài khoản";
        return View(new AccountModel
        {
            Customer = customer,
            Tab = current,
            Now = now,
            Keep = MembershipService.Keep(customer, spend, now),
            Orders = orders,
            ActiveOrders = orders.Count(o => o.Status is not (OrderStatus.Completed or OrderStatus.Cancelled)),
            UsableVouchers = promotions.Where(p =>
            {
                if (!PricingService.IsLive(p, now, SalesChannel.Online)) return false;
                if (p.Type == PromotionType.MemberVoucher) return PricingService.Tiers(p).Contains(customer.Tier);
                if (p.OwnerId is not null) return p.OwnerId == customer.Id;
                var tiers = PricingService.Tiers(p);
                return !string.IsNullOrEmpty(p.Code) && (tiers.Length == 0 || tiers.Contains(customer.Tier));
            }).ToList(),
            Stars = await starQuery.OrderByDescending(e => e.At).ThenByDescending(e => e.Id).Take(starLimit).ToListAsync(),
            StarTotal = await starQuery.CountAsync(),
            StarLimit = starLimit,
            MyVouchers = await loyalty.VouchersOfAsync(id),
            TierHistory = await Db.TierChanges.AsNoTracking().Where(t => t.CustomerId == id).OrderByDescending(t => t.At).ThenByDescending(t => t.Id).ToListAsync(),
            OrderFilter = AccountModel.OrderFilters.Any(f => f.Key == loc) ? loc! : "tat-ca",
            OrderLimit = Math.Clamp(so ?? AccountModel.OrderPage, AccountModel.OrderPage, 1000),
            ProfileErrors = profile?.Errors is { Count: > 0 } e ? Errors(e) : null,
            ProfileValues = profile?.Values,
            PasswordErrors = passwordErrors is { Count: > 0 } pe ? Errors(pe) : null,
            Categories = shop.Categories,
        });
    }

    private static FormErrors Errors(Dictionary<string, string> source)
    {
        var errors = new FormErrors();
        foreach (var (k, v) in source) errors.Set(k, v);
        return errors;
    }

    private sealed class ProfileFormState
    {
        public ProfileInput Values { get; set; } = new();
        public Dictionary<string, string> Errors { get; set; } = [];
    }

    /// <summary>Tab "Thông tin": họ tên, email, ngày sinh (số điện thoại là tài khoản đăng nhập nên không sửa).</summary>
    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> Profile(ProfileInput input)
    {
        var id = User.CustomerId()!;
        var now = DateTime.Now;
        DateTime? birthday = null;
        var errors = new FormErrors();
        if (!string.IsNullOrWhiteSpace(input.Birthday))
        {
            if (DateTime.TryParseExact(input.Birthday.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var b)) birthday = b;
            else errors.Set("Birthday", "Ngày sinh không hợp lệ");
        }
        if (errors.Count == 0) errors = await customers.UpdateProfileAsync(id, input.FullName, input.Email, birthday, now, storefront: true);
        if (errors.Count > 0)
        {
            TempData["ProfileForm"] = JsonSerializer.Serialize(new ProfileFormState { Values = input, Errors = new Dictionary<string, string>(errors) }, JsonOptions);
            return Redirect(ShopUrls.AccountTab("thong-tin"));
        }

        // Tên mới hiện ngay trên đầu trang: ký lại cookie đăng nhập với tên mới.
        var customer = await Db.Customers.AsNoTracking().FirstAsync(c => c.Id == id);
        await SignInCustomerAsync(customer);
        this.Toast("Đã lưu thông tin tài khoản");
        return Redirect(ShopUrls.AccountTab("thong-tin"));
    }

    /// <summary>Tab "Thông tin": đổi mật khẩu bằng mật khẩu hiện tại. Lỗi mang qua lần chuyển trang, không mang mật khẩu.</summary>
    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> ChangePassword(string? current, string? password, string? confirm)
    {
        var errors = await passwords.ChangeCustomerAsync(User.CustomerId()!, current, password, confirm);
        if (errors.Count > 0) TempData["PasswordForm"] = JsonSerializer.Serialize(new Dictionary<string, string>(errors), JsonOptions);
        else this.Toast("Đã đổi mật khẩu", "Lần sau đăng nhập bằng mật khẩu mới.");
        return Redirect(ShopUrls.AccountTab("thong-tin") + "#doi-mat-khau");
    }

    /// <summary>Đổi sao vàng lấy voucher.</summary>
    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> Redeem(string rewardId)
    {
        var result = await loyalty.RedeemAsync(User.CustomerId()!, rewardId);
        if (result.Ok)
            this.Toast($"Đã đổi voucher {Money.Format(result.Voucher!.Value)}",
                $"Mã {result.Voucher.Code} đã vào mục Voucher của tôi, dùng trong {StarService.RewardVoucherDays} ngày.");
        else
            this.ToastError(result.Error ?? "Chưa đổi được voucher");
        return Redirect(ShopUrls.AccountTab("sao-vang"));
    }

    /// <summary>Gắn voucher vào giỏ hàng; điều kiện của mã được kiểm tra ở giỏ.</summary>
    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public IActionResult UseVoucher(string code)
    {
        cart.SetCode(code);
        this.Toast($"Đã gắn voucher {code} vào giỏ hàng", "Voucher được kiểm tra điều kiện khi bạn đặt hàng.");
        return Redirect(ShopUrls.Cart);
    }

    // ------------------------------------------------------------------ địa chỉ giao hàng

    [Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> Address(string? id, string? returnUrl)
    {
        var customer = await Db.Customers.Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == User.CustomerId());
        if (customer is null) return Redirect(ShopUrls.SignIn);
        var address = id is null ? null : customer.Addresses.FirstOrDefault(a => a.Id == id);
        if (id is not null && address is null) return NotFound();

        var input = address is null
            ? new AddressInput { Recipient = customer.FullName, Phone = customer.Phone, Label = customer.Addresses.Count == 0 ? "Nhà riêng" : "", IsDefault = customer.Addresses.Count == 0 }
            : AddressInput.From(address);
        return await AddressViewAsync(input, returnUrl, null);
    }

    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> Address(AddressInput input, string? returnUrl)
    {
        var customer = await Db.Customers.Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == User.CustomerId());
        if (customer is null) return Redirect(ShopUrls.SignIn);
        var provinces = await Db.Stores.Select(s => s.Province).Distinct().ToListAsync();

        var phone = Phone.Normalize(input.Phone ?? "");
        string? error = null;
        if (string.IsNullOrWhiteSpace(input.Label)) error = "Đặt tên gợi nhớ cho địa chỉ, ví dụ Nhà riêng";
        else if (string.IsNullOrWhiteSpace(input.Recipient) || input.Recipient.Trim().Length < 2) error = "Nhập họ tên người nhận";
        else if (!Phone.IsValid(phone)) error = Phone.Rule;
        else if (!provinces.Contains(input.Province ?? "")) error = "Chọn tỉnh / thành phố có cửa hàng";
        else if (string.IsNullOrWhiteSpace(input.Ward) || input.Ward.Trim().Length < 2) error = "Nhập phường / xã";
        else if (string.IsNullOrWhiteSpace(input.Line) || input.Line.Trim().Length < 4) error = "Nhập số nhà, tên đường";
        if (error is not null) return await AddressViewAsync(input, returnUrl, error);

        var address = input.Id is null ? null : customer.Addresses.FirstOrDefault(a => a.Id == input.Id);
        if (address is null)
        {
            address = new Address { Id = $"addr-{Guid.NewGuid():N}"[..13], CustomerId = customer.Id };
            customer.Addresses.Add(address);
        }
        address.Label = input.Label!.Trim();
        address.Recipient = input.Recipient!.Trim();
        address.Phone = phone;
        address.Line = input.Line!.Trim();
        address.Ward = input.Ward!.Trim();
        address.Province = input.Province!;
        var point = input.Point();
        address.Lat = point?.Lat;
        address.Lng = point?.Lng;
        // Địa chỉ đầu tiên luôn là mặc định; chọn mặc định thì bỏ cờ của các địa chỉ khác.
        if (input.IsDefault || customer.Addresses.Count == 1)
        {
            foreach (var a in customer.Addresses) a.IsDefault = a == address;
        }
        await Db.SaveChangesAsync();
        cart.SetAddress(address.Id);

        TempData["Toast"] = $"Đã lưu địa chỉ {address.Label}";
        return LocalRedirect(Url.IsLocalUrl(returnUrl) ? returnUrl! : ShopUrls.AccountTab("dia-chi"));
    }

    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> DeleteAddress(string id)
    {
        var customer = await Db.Customers.Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == User.CustomerId());
        var address = customer?.Addresses.FirstOrDefault(a => a.Id == id);
        if (customer is null || address is null) return NotFound();
        customer.Addresses.Remove(address);
        Db.Addresses.Remove(address);
        if (address.IsDefault && customer.Addresses.FirstOrDefault() is { } next) next.IsDefault = true;
        await Db.SaveChangesAsync();
        if (cart.AddressId() == id) cart.SetAddress(null);
        this.Toast("Đã xoá địa chỉ", address.Label);
        return Redirect(ShopUrls.AccountTab("dia-chi"));
    }

    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> DefaultAddress(string id)
    {
        var customer = await Db.Customers.Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == User.CustomerId());
        var address = customer?.Addresses.FirstOrDefault(a => a.Id == id);
        if (customer is null || address is null) return NotFound();
        foreach (var a in customer.Addresses) a.IsDefault = a.Id == id;
        await Db.SaveChangesAsync();
        this.Toast("Đã đổi địa chỉ mặc định", $"{address.Label}: {address.Line}, {address.Ward}");
        return Redirect(ShopUrls.AccountTab("dia-chi"));
    }

    private async Task<IActionResult> AddressViewAsync(AddressInput input, string? returnUrl, string? error)
    {
        await FillMenuAsync();
        ViewData["Title"] = input.Id is null ? "Thêm địa chỉ" : "Sửa địa chỉ";
        var stores = await Db.Stores.OrderBy(s => s.Code).ToListAsync();
        return View("Address", new AddressFormModel(input, stores, returnUrl, error));
    }

    private async Task SignInCustomerAsync(Customer customer)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, customer.Id),
            new Claim(ClaimTypes.Name, customer.FullName),
            new Claim(ClaimTypes.Role, Roles.Customer),
        ], CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
    }
}

/// <summary>Dữ liệu ô nhập của form địa chỉ.</summary>
public class AddressInput
{
    public string? Id { get; set; }
    public string? Label { get; set; }
    public string? Recipient { get; set; }
    public string? Phone { get; set; }
    public string? Line { get; set; }
    public string? Ward { get; set; }
    public string? Province { get; set; }
    public bool IsDefault { get; set; }
    /// <summary>
    /// Toạ độ để dạng chữ, đọc bằng dấu chấm thập phân. Để kiểu số thì máy chủ chạy tiếng Việt sẽ hiểu
    /// "10.7769" là 107769 (dấu chấm là dấu phân cách hàng nghìn) và chọn sai cửa hàng giao.
    /// </summary>
    public string? Lat { get; set; }
    public string? Lng { get; set; }

    public static AddressInput From(Address a) => new()
    {
        Id = a.Id, Label = a.Label, Recipient = a.Recipient, Phone = a.Phone, Line = a.Line, Ward = a.Ward,
        Province = a.Province, IsDefault = a.IsDefault,
        Lat = a.Lat?.ToString(CultureInfo.InvariantCulture), Lng = a.Lng?.ToString(CultureInfo.InvariantCulture),
    };

    /// <summary>Toạ độ hợp lệ (vĩ độ ±90, kinh độ ±180), hoặc null khi trống hay sai.</summary>
    public (double Lat, double Lng)? Point()
    {
        if (!double.TryParse(Lat, NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)) return null;
        if (!double.TryParse(Lng, NumberStyles.Float, CultureInfo.InvariantCulture, out var lng)) return null;
        return lat is >= -90 and <= 90 && lng is >= -180 and <= 180 ? (lat, lng) : null;
    }
}

public record AddressFormModel(AddressInput Input, List<Store> Stores, string? ReturnUrl, string? Error);
