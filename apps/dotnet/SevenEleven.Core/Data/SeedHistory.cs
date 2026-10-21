using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Core.Data;

/// <summary>
/// Dữ liệu mẫu có lịch sử, chuyển từ lib/seed.ts: 3.000 thành viên, 35 ngày đơn hàng của cả chuỗi,
/// lô hàng có hạn dùng và phiếu nhập. Sinh theo "bây giờ" nên bảng điều khiển luôn có số hôm nay,
/// 7 ngày và 30 ngày trông như thật.
/// </summary>
public static partial class SeedData
{
    public const int DaysOfHistory = 35;
    public const int MemberCount = 3000;

    private static readonly string[] LastNames = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"];
    private static readonly string[] MiddleNames = ["Thị", "Văn", "Minh", "Ngọc", "Thanh", "Hoàng", "Gia", "Khánh", "Phương", "Quốc", "Bảo", "Thu"];
    private static readonly string[] FirstNames =
    [
        "An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Hải", "Hạnh", "Hiếu", "Hòa", "Huy", "Khang", "Khoa", "Lan", "Linh", "Long", "Mai", "Nam", "Nga",
        "Nhi", "Phong", "Phúc", "Quang", "Quyên", "Sơn", "Tâm", "Thảo", "Thịnh", "Trang", "Trí", "Trinh", "Tú", "Uyên", "Việt", "Vy", "Xuân", "Yến",
    ];

    private static readonly (string Line, string Ward)[] StreetsHcm =
    [
        ("Số 18 Nguyễn Trãi", "Phường Bến Thành"), ("Số 102 Lê Lai", "Phường Bến Thành"), ("Số 7 Pasteur", "Phường Sài Gòn"),
        ("Số 55 Võ Thị Sáu", "Phường Xuân Hòa"), ("Số 230 Nguyễn Văn Linh", "Phường Tân Mỹ"), ("Số 14 Hoa Lan", "Phường Cầu Kiệu"),
        ("Số 9 Quốc Hương", "Phường An Khánh"), ("Số 41 Tô Hiến Thành", "Phường Diên Hồng"),
    ];
    private static readonly (string Line, string Ward)[] StreetsHn =
        [("Số 12 Hàng Bài", "Phường Hoàn Kiếm"), ("Số 88 Kim Mã", "Phường Ngọc Hà"), ("Số 25 Tạ Quang Bửu", "Phường Bạch Mai")];

    /// <summary>Đường cầu theo giờ của một cửa hàng tiện lợi (0–23 giờ).</summary>
    private static readonly (int Hour, double Weight)[] HourWeights =
    [
        (0, 1.2), (1, 0.8), (2, 0.5), (3, 0.3), (4, 0.3), (5, 0.8), (6, 2.4), (7, 4.2), (8, 3.6), (9, 2.2), (10, 2), (11, 3.4),
        (12, 3.8), (13, 2.4), (14, 2), (15, 2.4), (16, 2.8), (17, 3.6), (18, 4), (19, 3.8), (20, 3.2), (21, 2.8), (22, 2.2), (23, 1.6),
    ];

    private static readonly Dictionary<string, double> CategoryWeights = new()
    {
        ["tra-sua"] = 5, ["mon-ngon"] = 6, ["cac-loai-banh"] = 4, ["do-uong-dong-chai"] = 6, ["do-an-vat"] = 4,
        ["san-pham-tu-sua"] = 3, ["do-dong-lanh"] = 2, ["do-uong-co-con"] = 2, ["do-kho-ngu-coc"] = 2, ["rau-cu-trai-cay"] = 1,
        ["thit-nguoi"] = 1, ["cham-soc-ca-nhan"] = 1, ["cham-soc-nha-cua"] = 1, ["van-phong-pham"] = 0.6, ["phu-kien-dien-tu"] = 0.5,
    };

    /// <summary>Ba tài khoản demo: hạng, chi tiêu xét hạng và số sao ghi trong tài liệu hướng dẫn.</summary>
    private static readonly (string Id, string Name, string Phone, MemberTier Tier, int Spend, int Stars, string Line, string Ward, double Lat, double Lng)[] DemoMembers =
    [
        ("cu-demo-gold", "Trần Thu Hà", "0901234567", MemberTier.Gold, 4_600_000, 40, "Số 9 Quốc Hương", "Phường An Khánh", 10.8029, 106.7327),
        ("cu-demo-diamond", "Lê Minh Tuấn", "0912345678", MemberTier.Diamond, 7_200_000, 43, "Số 12 Nguyễn Thị Minh Khai", "Phường Sài Gòn", 10.7810, 106.6980),
        ("cu-demo-silver", "Phạm Khánh Linh", "0987654321", MemberTier.Silver, 1_900_000, 18, "Số 40 Phan Đăng Lưu", "Phường Gia Định", 10.8020, 106.6910),
    ];

    private const string Hcm = "TP Hồ Chí Minh";
    private const string Hanoi = "Hà Nội";

    // ------------------------------------------------------------------ nhà cung cấp

    /// <summary>Nhà cung cấp giả lập (tên, mã số thuế, người liên hệ đều bịa).</summary>
    private static List<Supplier> Suppliers() =>
    [
        new() { Id = "sup-bep", Code = "NCC001", Name = "Bếp Trung Tâm Nhà Bảy", ContactName = "Phạm Quang Minh", Phone = "02839000101",
            Email = "dathang@beptrungtam.demo", Address = "KCN Tân Tạo, TP Hồ Chí Minh", TaxCode = "0312000101", CategoryIds = "mon-ngon,cac-loai-banh,tra-sua" },
        new() { Id = "sup-douong", Code = "NCC002", Name = "Công ty CP Đồ uống Phương Nam", ContactName = "Lê Thị Hồng", Phone = "02743900102",
            Email = "sales@douongphuongnam.demo", Address = "Số 12 đường số 3, KCN Sóng Thần, Bình Dương", TaxCode = "3700000102", CategoryIds = "do-uong-dong-chai" },
        new() { Id = "sup-sua", Code = "NCC003", Name = "Công ty TNHH Sữa Cao Nguyên", ContactName = "Ngô Văn Hải", Phone = "02633900103",
            Email = "phanphoi@suacaonguyen.demo", Address = "Phường 4, Đà Lạt, Lâm Đồng", TaxCode = "5800000103", CategoryIds = "san-pham-tu-sua,do-dong-lanh" },
        new() { Id = "sup-banhkeo", Code = "NCC004", Name = "Công ty TNHH Bánh Kẹo Hạnh Phúc", ContactName = "Trần Mỹ Duyên", Phone = "02839000104",
            Email = "order@banhkeohanhphuc.demo", Address = "Số 88 Kinh Dương Vương, TP Hồ Chí Minh", TaxCode = "0312000104", CategoryIds = "do-an-vat,do-kho-ngu-coc" },
        new() { Id = "sup-tieudung", Code = "NCC005", Name = "Công ty CP Hàng tiêu dùng An Khang", ContactName = "Đoàn Minh Trí", Phone = "02439000105",
            Email = "kinhdoanh@ankhang.demo", Address = "KCN Quang Minh, Hà Nội", TaxCode = "0100000105", CategoryIds = "cham-soc-ca-nhan,cham-soc-nha-cua" },
        new() { Id = "sup-bia", Code = "NCC006", Name = "Công ty TNHH Phân phối Bia Rượu Sài Thành", ContactName = "Huỳnh Tấn Lộc", Phone = "02839000106",
            Email = "dathang@saithanhbev.demo", Address = "Số 5 Hoàng Hữu Nam, TP Hồ Chí Minh", TaxCode = "0312000106", CategoryIds = "do-uong-co-con" },
        new() { Id = "sup-tuoisong", Code = "NCC007", Name = "HTX Nông sản Tươi Sống Củ Chi", ContactName = "Nguyễn Thị Sáu", Phone = "02839000107",
            Email = "hopdong@nongsancuchi.demo", Address = "Xã Củ Chi, TP Hồ Chí Minh", TaxCode = "0312000107", CategoryIds = "rau-cu-trai-cay,thit-nguoi" },
        new() { Id = "sup-vpp", Code = "NCC008", Name = "Công ty TNHH Văn phòng phẩm & Điện tử Trường Thành", ContactName = "Vũ Đức Toàn", Phone = "02439000108",
            Email = "sales@truongthanh.demo", Address = "Số 20 Láng Hạ, Hà Nội", TaxCode = "0100000108", CategoryIds = "van-phong-pham,phu-kien-dien-tu",
            Status = SupplierStatus.Inactive },
    ];

    // ------------------------------------------------------------------ thành viên

    /// <summary>Chi tiêu xét hạng mà một thành viên đã có trước khi lịch sử mẫu bắt đầu.</summary>
    private static int OpeningTierSpend(SeedRandom r, MemberTier tier) => tier switch
    {
        MemberTier.Diamond => 5_000_000 + r.Int(0, 60) * 100_000,
        MemberTier.Gold => 3_000_000 + r.Int(0, 30) * 100_000,
        MemberTier.Silver => 1_000_000 + r.Int(0, 12) * 100_000,
        _ => r.Int(0, 8) * 100_000,
    };

    /// <summary>
    /// 3 tài khoản demo + 597 thành viên ngẫu nhiên, khoảng một phần tư ở Hà Nội. Bản Next.js chỉ có
    /// 120 người vì giới hạn bộ nhớ trình duyệt; ít người mà chia nhau ngần ấy đơn thì ai cũng lên
    /// Kim cương, nên bản có máy chủ dùng tập đông hơn cho giống thật.
    /// </summary>
    private static List<Customer> Customers(SeedRandom r, DateTime now, string passwordHash)
    {
        var historyStart = now.Date.AddDays(-DaysOfHistory);
        var customers = new List<Customer>();
        var phones = new HashSet<string>(DemoMembers.Select(d => d.Phone));

        foreach (var d in DemoMembers)
        {
            var joined = now.Date.AddMonths(-10);
            customers.Add(new Customer
            {
                Id = d.Id, FullName = d.Name, Phone = d.Phone, Tier = d.Tier, TierSpend = d.Spend, TierSince = joined.AddMonths(3),
                ReviewedMonth = MembershipService.MonthKey(now.AddMonths(-1)), Stars = d.Stars, StarCarry = r.Int(0, 44) * 1_000,
                TotalSpent = d.Spend + r.Int(4, 12) * 50_000, OrderCount = r.Int(20, 40), JoinedAt = joined, PasswordHash = passwordHash,
                Addresses =
                [
                    new Address
                    {
                        Id = $"addr-{d.Id}", Label = "Nhà riêng", Recipient = d.Name, Phone = d.Phone,
                        Line = d.Line, Ward = d.Ward, Province = Hcm, IsDefault = true, Lat = d.Lat, Lng = d.Lng,
                    },
                ],
            });
        }

        for (var i = customers.Count; i < MemberCount; i++)
        {
            var id = $"cu-{i + 1:0000}";
            var name = $"{r.Pick(LastNames)} {r.Pick(MiddleNames)} {r.Pick(FirstNames)}";
            string phone;
            do phone = "0" + r.Pick(new[] { "90", "91", "93", "94", "96", "97", "98", "38", "39", "70", "77", "81", "83", "85" }) + r.Int(1_000_000, 9_999_999);
            while (!phones.Add(phone));

            var joinedRecently = r.Chance(0.1);
            var tier = joinedRecently
                ? MemberTier.Bronze
                : r.Weighted<MemberTier>([(MemberTier.Bronze, 4), (MemberTier.Silver, 4), (MemberTier.Gold, 2), (MemberTier.Diamond, 1)]);
            var tierSpend = joinedRecently ? 0 : OpeningTierSpend(r, tier);
            var hanoi = r.Chance(0.25);
            var joined = historyStart.AddDays(joinedRecently ? r.Int(8, 30) : -r.Int(40, 900));
            var tierSince = joinedRecently ? joined : historyStart.AddDays(-r.Int(5, 35));

            var addresses = new List<Address> { RandomAddress(r, $"{id}-a1", name, phone, hanoi, "Nhà riêng", true) };
            if (r.Chance(0.35)) addresses.Add(RandomAddress(r, $"{id}-a2", name, phone, hanoi, "Công ty", false));

            customers.Add(new Customer
            {
                Id = id, FullName = name, Phone = phone, Tier = tier, TierSpend = tierSpend,
                TierSince = tierSince < joined ? joined : tierSince,
                ReviewedMonth = MembershipService.MonthKey((joinedRecently ? joined : historyStart).AddMonths(-1)),
                Birthday = r.Chance(0.7) ? new DateTime(r.Int(1975, 2006), r.Int(1, 12), r.Int(1, 28)) : null,
                Stars = joinedRecently ? 0 : r.Int(0, 20),
                StarCarry = joinedRecently ? 0 : r.Int(0, 44) * 1_000,
                TotalSpent = tierSpend + r.Int(0, 40) * 250_000,
                OrderCount = joinedRecently ? 0 : r.Int(3, 40),
                JoinedAt = joined,
                PasswordHash = passwordHash,
                Addresses = addresses,
            });
        }
        return customers;
    }

    private static Address RandomAddress(SeedRandom r, string id, string recipient, string phone, bool hanoi, string label, bool isDefault)
    {
        var (line, ward) = r.Pick(hanoi ? StreetsHn : StreetsHcm);
        return new Address
        {
            Id = id, Label = label, Recipient = recipient, Phone = phone, Line = line, Ward = ward,
            Province = hanoi ? Hanoi : Hcm, IsDefault = isDefault,
        };
    }

    // ------------------------------------------------------------------ đơn hàng

    private record HistoryResult(List<Order> Orders, List<StarEntry> Stars);

    /// <summary>Ai đứng quầy lúc nào: lịch xoay ca cố định, 00:00–05:59 thuộc ca đêm của hôm trước.</summary>
    private static Employee? OnDuty(IReadOnlyList<Employee> staff, DateTime day0, DateTime at)
    {
        if (staff.Count == 0) return null;
        var (date, shift) = at.Hour switch
        {
            < 6 => (at.Date.AddDays(-1), 2),
            < 14 => (at.Date, 0),
            < 22 => (at.Date, 1),
            _ => (at.Date, 2),
        };
        var d = (int)Math.Round((date - day0).TotalDays);
        return staff[(((d + shift) % staff.Count) + staff.Count) % staff.Count];
    }

    private static List<CartLine> PickProducts(SeedRandom r, Dictionary<string, List<Product>> byCategory, int hour)
    {
        var count = r.Weighted<int>([(1, 5), (2, 4), (3, 2), (4, 1)]);
        var weights = CategoryWeights.Select(kv =>
        {
            var w = kv.Value;
            if (kv.Key == "do-uong-co-con") w = hour >= 17 || hour < 2 ? 4 : 0.3;
            if (kv.Key is "cac-loai-banh" or "san-pham-tu-sua" && hour is >= 6 and <= 9) w *= 2;
            if (kv.Key == "mon-ngon" && (hour is >= 11 and <= 13 || hour is >= 17 and <= 20)) w *= 1.8;
            return (kv.Key, w);
        }).ToList();

        var lines = new Dictionary<string, int>();
        for (var i = 0; i < count; i++)
        {
            var category = r.Weighted(weights);
            if (!byCategory.TryGetValue(category, out var pool) || pool.Count == 0) continue;
            var product = r.Pick(pool);
            lines[product.Id] = lines.GetValueOrDefault(product.Id) + r.Weighted<int>([(1, 8), (2, 3), (3, 1)]);
        }
        return lines.Select(kv => new CartLine(kv.Key, kv.Value)).ToList();
    }

    private static int RoundCash(SeedRandom r, int total)
    {
        if (r.Chance(0.3)) return total;
        int[] steps = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000];
        return r.Pick(steps.Select(s => (total + s - 1) / s * s).Distinct().ToList());
    }

    /// <summary>Đơn online bao lâu tuổi thì tới bước nào.</summary>
    private static OrderStatus OnlineProgress(SeedRandom r, double ageMinutes) => ageMinutes switch
    {
        > 120 => r.Chance(0.05) ? OrderStatus.Cancelled : OrderStatus.Completed,
        < 6 => OrderStatus.Pending,
        < 12 => OrderStatus.Confirmed,
        < 22 => OrderStatus.Preparing,
        < 45 => OrderStatus.Delivering,
        _ => OrderStatus.Completed,
    };

    private static List<OrderEvent> Timeline(OrderStatus status, DateTime createdAt, string? by)
    {
        if (status == OrderStatus.Cancelled)
        {
            return
            [
                new OrderEvent { Status = OrderStatus.Pending, At = createdAt },
                new OrderEvent { Status = OrderStatus.Cancelled, At = createdAt.AddMinutes(7), By = by, Note = "Khách yêu cầu huỷ" },
            ];
        }
        (OrderStatus Status, int Minutes)[] steps =
            [(OrderStatus.Pending, 0), (OrderStatus.Confirmed, 4), (OrderStatus.Preparing, 9), (OrderStatus.Delivering, 18), (OrderStatus.Completed, 38)];
        var events = new List<OrderEvent>();
        foreach (var (s, minutes) in steps)
        {
            events.Add(new OrderEvent { Status = s, At = createdAt.AddMinutes(minutes), By = s == OrderStatus.Pending ? null : by });
            if (s == status) break;
        }
        return events;
    }

    /// <summary>
    /// 35 ngày đơn hàng: mỗi cửa hàng 62–88 đơn tại quầy và 14–22 đơn online một ngày (Hà Nội vắng
    /// hơn 20%, cuối tuần đông hơn), đủ khoảng 12 triệu doanh thu mỗi cửa hàng mỗi ngày như ngân sách.
    /// Đơn của thành viên cộng hạng, cộng sao đúng như khi đặt thật.
    /// </summary>
    private static HistoryResult History(
        SeedRandom r, DateTime now, List<Product> products, List<Customer> customers,
        List<Promotion> promotions, List<Employee> employees, List<Store> stores)
    {
        var active = products.Where(p => p.IsActive).ToList();
        var productMap = products.ToDictionary(p => p.Id);
        var byCategory = active.GroupBy(p => p.CategoryId).ToDictionary(g => g.Key, g => g.ToList());
        var cashiers = employees
            .Where(e => e.Role == StaffRole.Cashier && e.StoreId is not null && e.Status == EmployeeStatus.Active)
            .GroupBy(e => e.StoreId!)
            .ToDictionary(g => g.Key, g => g.ToList());
        var riders = employees
            .Where(e => e.StoreId is not null && e.Status == EmployeeStatus.Active)
            .GroupBy(e => e.StoreId!)
            .ToDictionary(g => g.Key, g => g.ToList());
        var today = now.Date;
        var sinceMonday = ((int)today.DayOfWeek + 6) % 7;
        var day0 = today.AddDays(-sinceMonday - 7); // thứ Hai tuần trước: ngày 0 của lịch xoay ca
        Employee? CashierAt(string storeId, DateTime at) => OnDuty(cashiers.GetValueOrDefault(storeId) ?? [], day0, at);

        var demoIds = DemoMembers.Select(d => d.Id).ToHashSet();
        var hanoiMembers = customers.Where(c => c.Addresses[0].Province == Hanoi).ToList();
        var hcmMembers = customers.Where(c => c.Addresses[0].Province != Hanoi).ToList();
        // Vài khách quen mua phần lớn, nhiều người thỉnh thoảng; tài khoản demo mua thưa để giữ đúng hạng ghi trong tài liệu.
        var weights = customers.ToDictionary(c => c.Id, c => demoIds.Contains(c.Id)
            ? 0.4
            : r.Weighted<double>([(10, 1), (4, 3), (1.2, 4), (0.3, 3)]));
        Customer PickMember(List<Customer> pool) => r.Weighted(pool.Select(c => (c, weights[c.Id])).ToList());

        var orders = new List<Order>();
        var stars = new List<StarEntry>();
        // Chi tiêu xét hạng của từng thành viên theo tháng, để xét giữ hạng đúng trình tự thời gian
        // như hệ thống thật: đơn đầu tiên của tháng mới thì xét hết các tháng trước đó.
        var spendByMonth = new Dictionary<(string Customer, string Month), int>();
        void Review(Customer c, string upTo)
        {
            for (var month = MembershipService.ShiftMonth(c.ReviewedMonth, 1);
                 string.CompareOrdinal(month, upTo) < 0;
                 month = MembershipService.ShiftMonth(month, 1))
            {
                var at = MembershipService.MonthStart(MembershipService.ShiftMonth(month, 1));
                MembershipService.CheckKeepTier(c, month, spendByMonth.GetValueOrDefault((c.Id, month)), at);
                c.ReviewedMonth = month;
            }
        }
        var opening = now.Date.AddDays(-DaysOfHistory);
        foreach (var c in customers.Where(c => c.Stars > 0))
        {
            stars.Add(new StarEntry { CustomerId = c.Id, At = opening, Delta = c.Stars, Kind = StarEntryKind.Earn, Note = "Sao tích luỹ trước đó" });
        }

        Order Build(Store store, SalesChannel channel, DateTime createdAt, List<CartLine> lines, Customer? member, string? code,
            OrderStatus status, PaymentMethod payment, Employee? cashier, double? tripKm)
        {
            if (member is not null) Review(member, MembershipService.MonthKey(createdAt));
            var pricing = PricingService.PriceCart(lines, productMap, promotions, channel, member, code, channel == SalesChannel.Online, createdAt);
            var inStore = channel == SalesChannel.InStore;
            var paid = inStore || payment != PaymentMethod.Cod || status == OrderStatus.Completed;
            int? cash = payment == PaymentMethod.Cash ? RoundCash(r, pricing.Total) : null;
            List<OrderEvent> timeline = inStore
                ? [new OrderEvent { Status = OrderStatus.Completed, At = createdAt, By = cashier?.FullName }]
                : Timeline(status, createdAt, cashier?.FullName);

            var order = new Order
            {
                Channel = channel,
                StoreId = store.Id,
                CustomerId = member?.Id,
                EmployeeId = status == OrderStatus.Pending ? null : cashier?.Id,
                Subtotal = pricing.Subtotal,
                Discount = pricing.DiscountTotal,
                ShippingFee = pricing.ShippingFee,
                Total = pricing.Total,
                PromotionCode = pricing.AppliedCode?.Code,
                MemberSpend = member is null ? null : pricing.EligibleSpend,
                PaymentMethod = payment,
                PaymentStatus = status == OrderStatus.Cancelled
                    ? (payment == PaymentMethod.Cod ? PaymentStatus.Unpaid : PaymentStatus.Refunded)
                    : paid ? PaymentStatus.Paid : PaymentStatus.Unpaid,
                Status = status,
                CashReceived = cash,
                ChangeGiven = cash - pricing.Total,
                CreatedAt = createdAt,
                UpdatedAt = timeline[^1].At,
                Timeline = timeline,
                Items = pricing.Lines.Select(l => new OrderItem
                {
                    ProductId = l.Product.Id, Name = l.Product.Name, UnitPrice = l.UnitPrice, Quantity = l.Quantity,
                    Discount = l.LineDiscount, LineTotal = l.LineTotal, PromoLabel = l.PromoLabel,
                }).ToList(),
            };
            // Đơn huỷ trả lại lượt dùng mã, giống huỷ đơn thật.
            if (pricing.AppliedCode is not null && status != OrderStatus.Cancelled) pricing.AppliedCode.UsageCount += 1;

            var address = member?.Addresses.FirstOrDefault(a => a.IsDefault) ?? member?.Addresses.FirstOrDefault();
            if (!inStore && address is not null)
            {
                var km = tripKm ?? Math.Round((1 + r.Next() * 3.5) * 10) / 10;
                var crew = riders.GetValueOrDefault(store.Id) ?? [];
                var rider = crew.Count > 0 ? r.Pick(crew) : null;
                order.Delivery = new DeliveryInfo
                {
                    Recipient = address.Recipient,
                    Phone = address.Phone,
                    Address = $"{address.Line}, {address.Ward}, {address.Province}",
                    Eta = createdAt.AddMinutes(DeliveryService.Minutes(km)),
                    Note = r.Chance(0.2) ? r.Pick(new[] { "Gọi trước khi giao", "Để ở quầy lễ tân", "Không lấy ống hút", "Giao cổng sau" }) : null,
                    DistanceKm = km,
                    ShipperId = rider?.Id,
                    ShipperName = rider?.FullName,
                    ShipperPhone = rider?.Phone,
                };
            }

            // Thành viên: cộng sao và chi tiêu như lúc đặt thật (đơn huỷ thì không). Tài khoản demo
            // giữ nguyên hạng ghi trong tài liệu hướng dẫn nên không cộng chi tiêu xét hạng.
            if (member is not null && status != OrderStatus.Cancelled)
            {
                var (earned, carry) = StarService.Earn(member.StarCarry, pricing.EligibleSpend);
                order.StarsEarned = earned;
                member.StarCarry = carry;
                member.Stars += earned;
                member.OrderCount += 1;
                member.TotalSpent += pricing.Total;
                if (!demoIds.Contains(member.Id)) MembershipService.AddTierSpend(member, pricing.EligibleSpend, createdAt);
                var key = (member.Id, MembershipService.MonthKey(createdAt));
                spendByMonth[key] = spendByMonth.GetValueOrDefault(key) + pricing.EligibleSpend;
            }
            return order;
        }

        for (var offset = DaysOfHistory - 1; offset >= 0; offset--)
        {
            var day = today.AddDays(-offset);
            var weekend = day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
            var dayOrders = new List<Order>();

            foreach (var store in stores)
            {
                // Cửa hàng đang bảo trì đã ngưng bán từ 5 ngày trước.
                if (store.Status == StoreStatus.Maintenance && offset < 5) continue;
                if (store.Status == StoreStatus.Closed || store.OpenedAt > day) continue;
                var busy = store.Province == Hcm ? 1 : 0.8;
                var inStoreCount = (int)Math.Round(r.Int(62, 88) * busy * (weekend ? 1.25 : 1));
                var onlineCount = (int)Math.Round(r.Int(14, 22) * busy * (weekend ? 1.2 : 1));
                var local = store.Province == Hanoi ? hanoiMembers : hcmMembers;

                for (var k = 0; k < inStoreCount + onlineCount; k++)
                {
                    var channel = k < inStoreCount ? SalesChannel.InStore : SalesChannel.Online;
                    var hour = r.Weighted(HourWeights.Select(h => (h.Hour, h.Weight)).ToList());
                    var createdAt = day.AddHours(hour).AddMinutes(r.Int(0, 59)).AddSeconds(r.Int(0, 59));
                    if (createdAt > now) continue;
                    if (store.OpenHours != "24/7" && hour < 6) continue; // cửa hàng không mở đêm

                    var lines = PickProducts(r, byCategory, hour);
                    if (lines.Count == 0) continue;
                    var member = channel == SalesChannel.Online || r.Chance(0.35) ? PickMember(local) : null;
                    var code = r.Chance(0.08) ? r.Pick(new[] { "CHAOBAN", "GIAM10" }) : null;
                    var ageMinutes = (now - createdAt).TotalMinutes;
                    var status = channel == SalesChannel.InStore ? OrderStatus.Completed : OnlineProgress(r, ageMinutes);
                    var payment = channel == SalesChannel.InStore
                        ? r.Weighted<PaymentMethod>([(PaymentMethod.Cash, 45), (PaymentMethod.Ewallet, 30), (PaymentMethod.Card, 15), (PaymentMethod.BankTransfer, 10)])
                        : r.Weighted<PaymentMethod>([(PaymentMethod.Cod, 40), (PaymentMethod.Ewallet, 40), (PaymentMethod.Card, 20)]);
                    var order = Build(store, channel, createdAt, lines, member, code, status, payment, CashierAt(store.Id, createdAt), null);
                    if (order.Items.Count > 0) dayOrders.Add(order);
                }
            }

            // Hôm nay: thêm vài đơn online vừa đặt vài phút trước để bảng xử lý đơn luôn có việc.
            if (offset == 0)
            {
                var live = stores.Where(s => s.Status == StoreStatus.Active && s.Province == Hcm).ToList();
                (int Minutes, OrderStatus Status)[] ages =
                [
                    (2, OrderStatus.Pending), (5, OrderStatus.Pending), (9, OrderStatus.Confirmed),
                    (16, OrderStatus.Preparing), (21, OrderStatus.Preparing), (33, OrderStatus.Delivering),
                ];
                for (var i = 0; i < ages.Length; i++)
                {
                    var store = live[i % live.Count];
                    var createdAt = now.AddMinutes(-ages[i].Minutes);
                    if (createdAt < today) continue;
                    var lines = PickProducts(r, byCategory, createdAt.Hour);
                    if (lines.Count == 0) continue;
                    var member = PickMember(hcmMembers.Where(c => !demoIds.Contains(c.Id)).ToList());
                    var payment = r.Pick(new[] { PaymentMethod.Cod, PaymentMethod.Ewallet, PaymentMethod.Card });
                    var order = Build(store, SalesChannel.Online, createdAt, lines, member, null, ages[i].Status, payment,
                        CashierAt(store.Id, createdAt), Math.Round((0.6 + r.Next() * 3) * 10) / 10);
                    if (order.Items.Count > 0) dayOrders.Add(order);
                }
            }

            // Đánh số theo giờ đặt trong ngày, rồi ghi sổ sao bằng đúng mã đơn đó.
            var seq = 0;
            foreach (var o in dayOrders.OrderBy(o => o.CreatedAt))
            {
                seq++;
                o.Id = $"od-{day:yyyyMMdd}-{seq}";
                o.Code = $"DH{day:yyMMdd}{seq:0000}";
                orders.Add(o);
                if (o.CustomerId is string customerId && o.StarsEarned > 0)
                {
                    stars.Add(new StarEntry
                    {
                        CustomerId = customerId, At = o.CreatedAt, Delta = o.StarsEarned.Value, Kind = StarEntryKind.Earn,
                        Note = $"Tích sao từ đơn {o.Code}", Ref = o.Code,
                    });
                }
            }
        }

        // Xét nốt các tháng đã kết thúc cho những ai chưa mua gì trong tháng này.
        var thisMonth = MembershipService.MonthKey(now);
        foreach (var c in customers) Review(c, thisMonth);

        return new HistoryResult(orders, stars);
    }

    // ------------------------------------------------------------------ ca làm

    /// <summary>
    /// Lịch ca 14 ngày từ thứ Hai tuần trước, đúng bảng xoay ca đã dùng để gán thu ngân cho đơn hàng,
    /// nên tiền mặt từng ca khớp với đơn. Ca đã qua: 3% vắng, còn lại đã chốt (đa số khớp tiền, 10% thiếu
    /// 10–50 nghìn); ca đang diễn ra: đang làm; ca sắp tới: đã xếp lịch.
    /// </summary>
    private static List<Shift> Shifts(SeedRandom r, DateTime now, List<Store> stores, List<Employee> employees, List<Order> orders)
    {
        var today = now.Date;
        var day0 = ShiftService.WeekStart(today).AddDays(-7);
        var cash = orders
            .Where(o => o.Channel == SalesChannel.InStore && o.PaymentMethod == PaymentMethod.Cash && o.Status != OrderStatus.Cancelled)
            .GroupBy(o => (o.StoreId, Slot: ShiftService.SlotAt(o.CreatedAt)))
            .ToDictionary(g => g.Key, g => g.Sum(o => o.Total));
        var shifts = new List<Shift>();
        foreach (var store in stores.Where(s => s.Status != StoreStatus.Closed))
        {
            var staff = employees.Where(e => e.StoreId == store.Id && e.Role == StaffRole.Cashier && e.Status == EmployeeStatus.Active).ToList();
            if (staff.Count == 0) continue;
            for (var d = 0; d < 14; d++)
            {
                var date = day0.AddDays(d);
                foreach (var type in ShiftService.Types)
                {
                    if (!ShiftService.Runs(store, type)) continue;
                    var (start, end) = ShiftService.Window(date, type);
                    if (store.Status == StoreStatus.Maintenance && start > today.AddDays(-5)) continue;
                    var worker = staff[((d + (int)type) % staff.Count + staff.Count) % staff.Count];
                    var shift = new Shift
                    {
                        Id = ShiftService.SlotId(store.Code, date, type),
                        StoreId = store.Id,
                        EmployeeId = worker.Id,
                        Date = date,
                        Type = type,
                        Status = end <= now ? (r.Chance(0.03) ? ShiftStatus.Absent : ShiftStatus.Completed)
                            : start <= now ? ShiftStatus.InProgress : ShiftStatus.Scheduled,
                    };
                    if (shift.Status is ShiftStatus.Completed or ShiftStatus.InProgress)
                    {
                        shift.CheckInAt = start.AddMinutes(r.Int(-8, 6));
                        shift.OpeningCash = ShiftService.DefaultOpeningCash;
                    }
                    if (shift.Status == ShiftStatus.Completed)
                    {
                        shift.CheckOutAt = end.AddMinutes(r.Int(0, 12));
                        var sales = cash.GetValueOrDefault((store.Id, (date, type)));
                        shift.ClosingCash = ShiftService.DefaultOpeningCash + sales - (r.Chance(0.1) ? r.Int(1, 5) * 10_000 : 0);
                    }
                    shifts.Add(shift);
                }
            }
        }
        return shifts;
    }

    // ------------------------------------------------------------------ kho, lô, phiếu nhập

    /// <summary>Tồn kho đủ bán khoảng ba tuần, vài mặt hàng để sắp hết hoặc hết cho có việc mà xử lý.</summary>
    private static List<StockLevel> Stock(SeedRandom r, List<Product> products, List<Store> stores)
    {
        var levels = new List<StockLevel>();
        foreach (var store in stores)
        {
            foreach (var product in products)
            {
                var fresh = (product.ShelfLifeDays ?? 99) <= 3;
                var min = fresh ? 4 : r.Pick(new[] { 6, 8, 10, 12 });
                var quantity = fresh ? r.Int(4, 12) : r.Int(8, 26);
                var roll = r.Next();
                if (roll < 0.02) quantity = 0;
                else if (roll < 0.07) quantity = r.Int(1, min);
                levels.Add(new StockLevel { StoreId = store.Id, ProductId = product.Id, Quantity = quantity, MinQuantity = min });
            }
        }
        return levels;
    }

    /// <summary>
    /// Lô hàng tươi (trừ đồ pha chế tại quầy): lô cũ nhất có khoảng 25% hết hạn hôm nay, 3% đã quá
    /// hạn, còn lại hạn xa hơn — để màn hình lô hàng có việc cần xử lý.
    /// </summary>
    private static List<InventoryBatch> Batches(SeedRandom r, List<Product> products, List<Store> stores, List<StockLevel> stock, DateTime now)
    {
        var quantities = stock.ToDictionary(s => (s.StoreId, s.ProductId), s => s.Quantity);
        var batches = new List<InventoryBatch>();
        foreach (var store in stores)
        {
            foreach (var p in products)
            {
                if (p.ShelfLifeDays is not int shelf || p.CategoryId == "tra-sua") continue;
                var total = quantities.GetValueOrDefault((store.Id, p.Id));
                if (total <= 0) continue;
                int[] split = total > 6 && r.Chance(0.35) ? [(total + 1) / 2, total / 2] : [total];
                for (var i = 0; i < split.Length; i++)
                {
                    var ageDays = i == 0 ? (r.Chance(0.03) ? shelf + 1 : r.Chance(0.25) ? shelf : r.Int(0, Math.Max(0, shelf - 1))) : 0;
                    var receivedAt = now.Date.AddDays(-ageDays).AddHours(5).AddMinutes(30);
                    batches.Add(new InventoryBatch
                    {
                        StoreId = store.Id,
                        ProductId = p.Id,
                        LotCode = $"L{receivedAt:yyMMdd}{(char)('A' + i)}",
                        Quantity = split[i],
                        ReceivedAt = receivedAt,
                        ExpiresAt = receivedAt.Date.AddDays(shelf).AddHours(23).AddMinutes(59),
                    });
                }
            }
        }
        return batches;
    }

    /// <summary>46 phiếu nhập rải trong 35 ngày; vài phiếu gần đây còn chờ nhận hàng, có nháp và có phiếu huỷ.</summary>
    private static List<PurchaseOrder> PurchaseOrders(SeedRandom r, DateTime now, List<Product> products, List<Supplier> suppliers, List<Store> stores)
    {
        var orders = new List<PurchaseOrder>();
        var activeSuppliers = suppliers.Where(s => s.Status == SupplierStatus.Active).ToList();
        var openStores = stores.Where(s => s.Status != StoreStatus.Closed).ToList();
        for (var i = 0; i < 46; i++)
        {
            var supplier = r.Pick(activeSuppliers);
            var store = r.Pick(openStores);
            var categories = PurchasingService.CategoriesOf(supplier);
            var items = r.Shuffle(products.Where(p => categories.Contains(p.CategoryId)))
                .Take(r.Int(4, 9))
                .Select(p => new PurchaseOrderItem
                {
                    ProductId = p.Id, Quantity = r.Pick(new[] { 12, 24, 24, 36, 48 }), CostPrice = p.CostPrice,
                    LotCode = p.ShelfLifeDays is not null ? $"L{r.Int(100, 999)}" : null,
                })
                .ToList();
            var createdAt = now.AddHours(-r.Int(0, DaysOfHistory * 24));
            var ageHours = (now - createdAt).TotalHours;
            var status = ageHours > 72 ? PurchaseOrderStatus.Received
                : ageHours > 30 ? (r.Chance(0.5) ? PurchaseOrderStatus.Received : PurchaseOrderStatus.Ordered)
                : PurchaseOrderStatus.Ordered;
            if (i is 3 or 17) status = PurchaseOrderStatus.Draft;
            if (i == 9) status = PurchaseOrderStatus.Cancelled;
            orders.Add(new PurchaseOrder
            {
                Id = $"po-{i + 1:000}",
                SupplierId = supplier.Id,
                StoreId = store.Id,
                Items = items,
                Total = items.Sum(it => it.Quantity * it.CostPrice),
                Status = status,
                Note = r.Chance(0.2) ? r.Pick(new[] { "Giao trước 6h sáng", "Kiểm tra hạn sử dụng khi nhận", "Bổ sung hàng cuối tuần" }) : null,
                CreatedBy = store.ManagerId ?? "em-admin",
                CreatedAt = createdAt,
                ExpectedAt = status == PurchaseOrderStatus.Draft ? null : createdAt.AddHours(PurchasingService.LeadTimeHours),
                ReceivedAt = status == PurchaseOrderStatus.Received ? createdAt.AddHours(r.Int(14, 30)) : null,
            });
        }

        orders = orders.OrderBy(o => o.CreatedAt).ToList();
        // Giữ vài phiếu gần nhất ở trạng thái chờ nhận để luồng "nhận hàng" luôn có việc.
        foreach (var o in orders.TakeLast(4).Where(o => o.Status == PurchaseOrderStatus.Received))
        {
            o.Status = PurchaseOrderStatus.Ordered;
            o.ReceivedAt = null;
        }
        for (var i = 0; i < orders.Count; i++) orders[i].Code = $"PN{i + 1:00000}";
        return orders;
    }
}
