// Kịch bản trình duyệt cho cửa hàng online (bản C#): đăng ký OTP, đăng nhập, quên mật khẩu, khách tại
// quầy tạo mật khẩu, tài khoản, giỏ hàng + voucher, 18+, danh mục, khuyến mãi, 404, đường dẫn cũ.
//   node e2e/storefront-flow.cjs [baseUrl] [thư mục ảnh]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.argv[2] || process.env.BASE || 'http://localhost:5711';
const OUT = process.argv[3] || require('os').tmpdir() + '/seven-storefront-shots';
require('fs').mkdirSync(OUT, { recursive: true });
const results = [];
const errors = [];
const check = (name, cond, detail = '') => { results.push(`${cond ? 'OK ' : 'BAD'} ${name}${detail ? ' — ' + detail : ''}`); };
const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const newPhone = () => '03' + rnd();
const fmtPhone = p => `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;

(async () => {
  const browser = await chromium.launch();
  let last = null;
  async function newPage(width = 1280) {
    const c = await browser.newContext({ viewport: { width, height: 900 }, locale: 'vi-VN' });
    const p = await c.newPage();
    p.on('dialog', d => d.accept());
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${p.url()} :: ${m.text()}`); });
    p.on('pageerror', e => errors.push(`${p.url()} :: ${e.message}`));
    last = p;
    return p;
  }
  const text = async (p, sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  const toastText = async p => { await p.waitForSelector('#toasts .toast', { state: 'attached', timeout: 8000 }); return (await p.locator('#toasts').innerText()).replace(/\s+/g, ' '); };
  const otpCode = async p => (await p.locator('#toasts .toast-sms .sms-code').last().innerText()).trim();
  async function typeOtp(p, code) {
    await Promise.all([p.waitForNavigation(), p.locator('input[data-otp-box]').first().fill(code)]);
  }
  async function signIn(p, phone, password) {
    await p.goto(BASE + '/dang-nhap');
    await p.fill('#signin-phone', phone);
    await p.fill('#signin-password', password);
    await Promise.all([p.waitForNavigation(), p.click('.auth-form button[type=submit]')]);
  }
  async function signOut(p) {
    await p.goto(BASE + '/tai-khoan?tab=thong-tin');
    // Đăng xuất về trang chủ: chỉ đợi dựng xong trang, không đợi ảnh CDN (ảnh chậm hơn 4 giây là thông báo đã tự tắt).
    await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), p.locator('.profile-grid form[action="/Account/Logout"] button').click()]);
  }

  try {
    // ------------------------------------------------------------ A. Đăng ký có OTP
    const a = await newPage();
    const phone = newPhone();
    await a.goto(BASE + '/dang-nhap?tab=dang-ky');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    const emptyErrors = await a.locator('.field-error').allInnerTexts();
    check('sign-up empty validation', ['Nhập họ và tên của bạn', 'Nhập số điện thoại', 'Mật khẩu tối thiểu 6 ký tự', 'Nhập lại mật khẩu'].every(e => emptyErrors.includes(e)), emptyErrors.join(' | '));
    await a.fill('#signup-name', 'Nguyễn Minh Anh');
    await a.fill('#signup-phone', '0123');
    await a.fill('#signup-password', 'abc123');
    await a.fill('#signup-confirm', 'abc124');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    const e2 = await a.locator('.field-error').allInnerTexts();
    check('sign-up phone + mismatch validation', e2.includes('Số điện thoại gồm 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09') && e2.includes('Mật khẩu nhập lại không khớp'), e2.join(' | '));
    check('sign-up keeps name after error', (await a.inputValue('#signup-name')) === 'Nguyễn Minh Anh');
    await a.fill('#signup-phone', '0901234567');
    await a.fill('#signup-password', 'abc123');
    await a.fill('#signup-confirm', 'abc123');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    check('sign-up existing phone', (await text(a, '.field-error')).includes('Số 0901 234 567 đã là thành viên.'), await text(a, '.field-error'));
    await a.fill('#signup-phone', phone);
    await a.fill('#signup-password', 'abc123');
    await a.fill('#signup-confirm', 'abc123');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    check('sign-up → OTP step', a.url().includes('buoc=xac-minh') && (await text(a, 'h1')).includes('Xác minh số điện thoại'), a.url());
    const sms = await toastText(a);
    check('SMS toast shows code', sms.includes(`SMS giả lập tới ${fmtPhone(phone)}`) && /Mã xác minh của bạn là \d{6}, hiệu lực 5 phút/.test(sms), sms.slice(0, 160));
    const code = await otpCode(a);
    check('resend countdown', /Gửi lại sau \d+ giây/.test(await text(a, '.otp-resend')), await text(a, '.otp-resend'));
    await a.screenshot({ path: `${OUT}/a-otp.png` });
    const wrong = code === '000000' ? '111111' : '000000';
    await typeOtp(a, wrong);
    check('wrong OTP message', (await text(a, '.otp-error')).includes('Mã OTP không đúng, còn 4 lần thử'), await text(a, '.otp-error'));
    await a.click('[data-sms]');
    check('Xem lại tin nhắn shows SMS again', (await a.locator('#toasts .toast-sms:not([hidden])').count()) >= 1);
    await typeOtp(a, code);
    const t1 = await toastText(a);
    check('account created + signed in', a.url().endsWith('/tai-khoan') && t1.includes('Tạo tài khoản thành công') && t1.includes('Chào Nguyễn Minh Anh, bạn đang là thành viên hạng Đồng.'), `${a.url()} · ${t1.slice(0, 120)}`);
    check('new member header', (await text(a, '.account-head')).includes('Nguyễn Minh Anh') && (await text(a, '.account-head')).includes('Đồng'));
    await a.screenshot({ path: `${OUT}/a-account-new.png`, fullPage: true });

    // ------------------------------------------------------------ B. Đăng xuất
    await signOut(a);
    check('logout toast', a.url() === BASE + '/' && (await toastText(a)).includes('Đã đăng xuất khỏi tài khoản'), a.url());

    // ------------------------------------------------------------ C. Đăng nhập: sai mật khẩu, số chưa đăng ký, đúng
    await signIn(a, phone, 'sai-mat-khau');
    check('wrong password', (await text(a, '.field-error')).includes('Mật khẩu không đúng') && (await a.inputValue('#signin-phone')) === phone, await text(a, '.field-error'));
    const stranger = newPhone();
    await signIn(a, stranger, 'abc123');
    const notReg = await text(a, '.field-error');
    check('unregistered phone', notReg.includes(`Số ${fmtPhone(stranger)} chưa đăng ký thành viên.`) && notReg.includes('Đăng ký với số này'), notReg);
    await Promise.all([a.waitForNavigation(), a.click('.field-error a')]);
    check('"Đăng ký với số này" prefills sign-up', a.url().includes('tab=dang-ky') && (await a.inputValue('#signup-phone')) === stranger, a.url());
    await a.goto(BASE + '/tai-khoan?tab=sao-vang');
    check('protected page → /dang-nhap?next=', a.url().includes('/dang-nhap?next=') && decodeURIComponent(a.url()).includes('/tai-khoan?tab=sao-vang'), a.url());
    await a.fill('#signin-phone', phone);
    await a.fill('#signin-password', 'abc123');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    check('sign in → next + welcome toast', a.url().endsWith('/tai-khoan?tab=sao-vang') && (await toastText(a)).includes('Chào mừng Nguyễn Minh Anh quay lại'), a.url());
    await a.goto(BASE + '/dang-nhap?next=/khuyen-mai');
    check('signed-in visit to /dang-nhap goes to next', a.url().endsWith('/khuyen-mai'), a.url());
    await a.goto(BASE + '/dang-nhap?next=//evil.example');
    check('unsafe next ignored', a.url().endsWith('/tai-khoan'), a.url());

    // ------------------------------------------------------------ D. Quên mật khẩu → OTP → mật khẩu mới
    await signOut(a);
    await a.goto(BASE + '/dang-nhap');
    await Promise.all([a.waitForNavigation(), a.click('text=Quên mật khẩu?')]);
    check('forgot step', (await text(a, 'h1')).includes('Quên mật khẩu'));
    await a.fill('#forgot-phone', stranger);
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    check('forgot unknown phone', (await text(a, '.field-error')).includes(`Số ${fmtPhone(stranger)} chưa đăng ký thành viên.`), await text(a, '.field-error'));
    await a.fill('#forgot-phone', phone);
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    check('forgot → OTP', a.url().includes('buoc=xac-minh') && (await text(a, '[data-otp-submit]')) === 'Xác nhận', await text(a, '[data-otp-submit]'));
    await typeOtp(a, await otpCode(a));
    check('OTP → new password step', (await text(a, 'h1')).includes('Đặt mật khẩu mới') && (await text(a, '.auth-sub')).includes(`Đã xác minh số ${fmtPhone(phone)}`), await text(a, '.auth-sub'));
    await a.fill('#reset-password', 'moi123');
    await a.fill('#reset-confirm', 'moi124');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    check('new password mismatch', (await text(a, '.field-error')).includes('Mật khẩu nhập lại không khớp'));
    await a.fill('#reset-password', 'moi123');
    await a.fill('#reset-confirm', 'moi123');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    const t2 = await toastText(a);
    check('password reset + signed in', a.url().endsWith('/tai-khoan') && t2.includes('Đã đặt mật khẩu mới') && t2.includes('Chào Nguyễn Minh Anh, bạn đã đăng nhập.'), t2.slice(0, 120));
    await signOut(a);
    await signIn(a, phone, 'moi123');
    check('sign in with new password', a.url().endsWith('/tai-khoan'), a.url());

    // OTP sai 5 lần → khoá, gửi lại mã
    await signOut(a);
    await a.goto(BASE + '/dang-nhap?buoc=quen-mat-khau');
    await a.fill('#forgot-phone', phone);
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    const real = await otpCode(a);
    const bad = real === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await typeOtp(a, bad);
    const blocked = await text(a, '.otp-error');
    check('OTP locked after 5 wrong', blocked.includes('Đã nhập sai 5 lần') && (await text(a, '.otp-resend')).includes('Cần mã mới?') && await a.locator('[data-otp-submit]').isDisabled(), blocked);
    await Promise.all([a.waitForNavigation(), a.click('#resend-form button')]);
    const fresh = await otpCode(a);
    check('resend gives a new code', /^\d{6}$/.test(fresh) && fresh !== real && !(await a.locator('.otp-error').count()), fresh);

    // ------------------------------------------------------------ E. Khách đăng ký tại quầy tạo mật khẩu
    const counterPhone = newPhone();
    const staff = await newPage();
    await staff.goto(BASE + '/Admin/Account/Login');
    await staff.fill('#email', 'quanly1006@7eleven.demo');
    await staff.fill('#password', '123456');
    await Promise.all([staff.waitForNavigation(), staff.click('form.form button[type=submit]')]);
    await staff.goto(BASE + '/Admin/Pos');
    await staff.fill('#bill form[action$="/Member"] input[name=phone]', counterPhone);
    await staff.click('#bill form[action$="/Member"] button');
    await staff.waitForSelector('#bill form[action$="/Register"]');
    await staff.fill('#bill form[action$="/Register"] input[name=fullName]', 'Lê Văn Quầy');
    await staff.click('#bill form[action$="/Register"] button');
    await staff.waitForSelector('#bill .member-card');
    check('POS registers counter member', (await text(staff, '#bill .member-card')).includes('Lê Văn Quầy'));
    await a.goto(BASE + '/dang-nhap');
    await signIn(a, counterPhone, 'abc123');
    const np = await text(a, '.field-error');
    check('counter member has no password', np.includes('Tài khoản đăng ký tại cửa hàng nên chưa có mật khẩu.') && np.includes('Tạo mật khẩu'), np);
    await Promise.all([a.waitForNavigation(), a.click('.field-error a')]);
    check('"Tạo mật khẩu" → forgot with phone', (await a.inputValue('#forgot-phone')) === counterPhone);
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    await typeOtp(a, await otpCode(a));
    await a.fill('#reset-password', 'quay123');
    await a.fill('#reset-confirm', 'quay123');
    await Promise.all([a.waitForNavigation(), a.click('.auth-form button[type=submit]')]);
    check('counter member created password + signed in', a.url().endsWith('/tai-khoan') && (await text(a, '.account-head')).includes('Lê Văn Quầy'), a.url());

    // ------------------------------------------------------------ F. Tài khoản (demo): các tab, sửa hồ sơ
    const d = await newPage();
    await d.goto(BASE + '/dang-nhap');
    await d.click('.demo-btn');
    check('demo button fills form', (await d.inputValue('#signin-phone')) === '0901234567' && (await d.inputValue('#signin-password')) === '123456');
    await Promise.all([d.waitForNavigation(), d.click('.auth-form button[type=submit]')]);
    check('demo sign in', d.url().endsWith('/tai-khoan') && (await text(d, '.account-head')).includes('Trần Thu Hà'), d.url());
    // Hạng của khách demo đổi theo số đơn các lần chạy trước (LOI-CAN-SUA #2): lấy hạng đang hiện trên đầu trang.
    await d.goto(`${BASE}/tai-khoan`);
    const tierNow = (await d.locator('.account-head .tier-chip').first().innerText()).trim();
    const tabs = { 'tong-quan': `Quyền lợi hạng ${tierNow}`, hang: 'Lịch sử hạng', 'sao-vang': 'Đổi sao lấy voucher', 'don-hang': 'Đơn hàng', 'dia-chi': 'Sổ địa chỉ', 'thong-tin': 'Thông tin cá nhân' };
    for (const [tab, expect] of Object.entries(tabs)) {
      await d.goto(`${BASE}/tai-khoan?tab=${tab}`);
      const main = await text(d, 'main');
      check(`account tab ${tab}`, main.includes(expect) && main.toLowerCase().includes('thẻ thành viên') && main.includes('Chi tiêu tích luỹ xét hạng'), expect);
      await d.screenshot({ path: `${OUT}/f-tab-${tab}.png`, fullPage: true });
    }
    await d.goto(BASE + '/tai-khoan?tab=don-hang');
    if (await d.locator('.order-filters a').count()) {
      await Promise.all([d.waitForNavigation(), d.locator('.order-filters a', { hasText: 'Hoàn thành' }).click()]);
      check('orders filter chip', d.url().includes('loc=hoan-thanh') && (await d.locator('.order-filters a.active').innerText()).includes('Hoàn thành'), d.url());
    }
    await d.goto(BASE + '/tai-khoan?tab=thong-tin');
    check('profile save disabled until dirty', await d.locator('form[action="/Account/Profile"] button[type=submit]').isDisabled());
    await d.fill('#profile-name', 'A');
    await d.fill('#profile-email', 'khong-hop-le');
    await d.fill('#profile-birthday', '2099-01-01');
    await Promise.all([d.waitForNavigation(), d.click('form[action="/Account/Profile"] button[type=submit]')]);
    const pe = await d.locator('.field-error').allInnerTexts();
    check('profile validation errors', pe.includes('Nhập họ và tên') && pe.includes('Email chưa đúng định dạng') && pe.includes('Ngày sinh không hợp lệ'), pe.join(' | '));
    await d.fill('#profile-name', 'x'.repeat(61));
    await d.fill('#profile-email', 'ha.tran@example.com');
    await d.fill('#profile-birthday', '1995-10-12');
    await Promise.all([d.waitForNavigation(), d.click('form[action="/Account/Profile"] button[type=submit]')]);
    check('profile name max length', (await d.locator('.field-error').allInnerTexts()).includes('Họ tên tối đa 60 ký tự'));
    await d.fill('#profile-name', 'Trần Thu Hà');
    await d.fill('#profile-email', 'ha.tran@example.com');
    await d.fill('#profile-birthday', '1995-10-12');
    await Promise.all([d.waitForNavigation(), d.click('form[action="/Account/Profile"] button[type=submit]')]);
    check('profile saved', (await toastText(d)).includes('Đã lưu thông tin tài khoản') && (await d.inputValue('#profile-email')) === 'ha.tran@example.com');
    await d.goto(BASE + '/tai-khoan');
    check('birthday banner (tháng 10)', (await text(d, 'main')).includes('Chúc mừng tháng sinh nhật của bạn!'));
    // trả lại như dữ liệu mẫu
    await d.goto(BASE + '/tai-khoan?tab=thong-tin');
    await d.fill('#profile-email', '');
    await d.fill('#profile-birthday', '');
    await Promise.all([d.waitForNavigation(), d.click('form[action="/Account/Profile"] button[type=submit]')]);
    check('profile restored', (await d.inputValue('#profile-birthday')) === '');

    // ------------------------------------------------------------ G. Giỏ hàng: thêm nhanh, 18+, voucher, xoá, đặt hàng
    await d.goto(BASE + '/gio-hang');
    if (await d.locator('form[action="/Cart/Clear"]').count()) {
      await d.click('form[action="/Cart/Clear"] button');
      await Promise.all([d.waitForNavigation(), d.click('#confirm-dialog [data-confirm-ok]')]);
    }
    await d.goto(BASE + '/danh-muc/tra-sua');
    const firstCard = d.locator('.pcard').first();
    const name1 = (await firstCard.locator('.pcard-name').innerText()).trim();
    await firstCard.locator('.qa-plus').click();
    const qt = await toastText(d);
    check('quick add toast (no reload)', qt.includes('Đã thêm vào giỏ hàng') && qt.includes(name1) && d.url().endsWith('/danh-muc/tra-sua'), qt.slice(0, 120));
    await d.waitForSelector('.pcard >> nth=0 >> .qa-step');
    check('card turns into stepper', (await firstCard.locator('.qa-n').innerText()).trim() === '1');
    check('header badge updated', (await d.locator('[data-cart-count]').first().innerText()).trim() === '1');
    await firstCard.locator('.qa-inc').click();
    await d.waitForFunction(() => document.querySelector('.pcard .qa-n')?.textContent.trim() === '2');
    check('stepper + works', true);
    await firstCard.locator('.qa-step form:first-child button').click();
    await d.waitForFunction(() => document.querySelector('.pcard .qa-n')?.textContent.trim() === '1');
    check('stepper − works', true);
    // Trang sản phẩm: số lượng 3, thêm
    await d.goto(BASE + '/san-pham/oreo-banh-quy-kem-vani-123-5g-cookies');
    if (d.url().includes('oreo') && (await d.locator('.pdp-title').count())) {
      const max = parseInt(await d.getAttribute('.pdp', 'data-max'), 10);
      const want = Math.min(3, max);
      for (let i = 1; i < want; i++) await d.click('.buy-box [data-qty-inc]');
      const btn = await text(d, '.buy-box .buy-btn');
      check('stepper total updates', btn.includes((22000 * want).toLocaleString('vi-VN')), btn);
      await Promise.all([d.waitForNavigation(), d.click('.buy-box .buy-btn')]);
      check(`product page add qty ${want}`, (await toastText(d)).includes('Đã thêm vào giỏ hàng') && (await text(d, '.pdp-hints')).includes(`Đã có ${want} sản phẩm này trong giỏ`), btn);
    } else check('oreo product page exists', false, d.url());
    // Bia: hộp thoại 18+
    await d.goto(BASE + '/danh-muc/do-uong-co-con?nhom=bia');
    const beer = d.locator('.pcard').first();
    const beerHref = await beer.locator('.pcard-name a').getAttribute('href');
    await d.goto(BASE + beerHref);
    check('18+ notice on product', (await text(d, 'main')).includes('Sản phẩm giới hạn độ tuổi. Bạn sẽ được yêu cầu xác nhận đã đủ 18 tuổi khi thêm vào giỏ.'));
    await d.click('.buy-box .buy-btn');
    await d.waitForSelector('#age-gate[open]');
    check('age dialog opens', (await text(d, '#age-gate')).includes('Đồ uống có cồn chỉ bán cho khách từ đủ 18 tuổi trở lên.'));
    await d.screenshot({ path: `${OUT}/g-age-gate.png` });
    await d.click('#age-gate [data-close]');
    check('age dialog "Để sau" closes', !(await d.locator('#age-gate[open]').count()));
    await d.click('.buy-box .buy-btn');
    await Promise.all([d.waitForNavigation(), d.click('#age-ok')]);
    check('beer added after age confirm', (await toastText(d)).includes('Đã thêm vào giỏ hàng'));
    // Giỏ hàng
    await d.goto(BASE + '/gio-hang');
    const lines = await d.locator('.cart-line').count();
    check('cart has 3 lines', lines === 3, String(lines));
    await d.screenshot({ path: `${OUT}/g-cart.png`, fullPage: true });
    await d.click('.vf-add');
    await d.waitForSelector('#voucher-picker[open]');
    await d.screenshot({ path: `${OUT}/g-picker.png` });
    await d.fill('.vp-code input[name=code]', 'saima');
    await Promise.all([d.waitForNavigation(), d.click('.vp-code button')]);
    check('typed wrong code shows error in picker', (await d.locator('#voucher-picker[open]').count()) === 1 && (await text(d, '.vp-error')).includes('Mã khuyến mãi không tồn tại'), await text(d, '.vp-error'));
    const usable = d.locator('.vcard.usable');
    if (await usable.count()) {
      const code = await usable.first().locator('input[name=code]').getAttribute('value');
      await usable.first().click();
      check('picker footer shows chosen', (await text(d, '[data-voucher-chosen]')).includes(`Đã chọn ${code}`));
      await Promise.all([d.waitForNavigation(), d.click('[data-voucher-use]')]);
      const at = await toastText(d);
      check('voucher applied', at.includes(`Đã áp dụng voucher ${code}`) && (await text(d, '.vf-applied')).includes(`Voucher ${code}`) && (await text(d, '.vf-applied')).includes('Đã giảm'), at.slice(0, 120));
      await d.click('.vf-applied a[data-dialog-open]');
      await d.waitForSelector('#voucher-picker[open]');
      await Promise.all([d.waitForNavigation(), d.click('button[form="vp-remove"]')]);
      check('voucher removed', (await toastText(d)).includes(`Đã bỏ voucher ${code}`) && (await d.locator('.vf-add').count()) === 1);
    } else check('a usable voucher exists for this cart', false, await text(d, '.vf-add'));
    // Xoá một dòng + hoàn tác
    const removeName = (await d.locator('.cart-line .cl-name').first().innerText()).trim();
    await Promise.all([d.waitForNavigation(), d.locator('.cart-line .cl-trash').first().click()]);
    const rt = await toastText(d);
    check('remove line toast', rt.includes('Đã xoá khỏi giỏ hàng') && rt.includes(removeName), rt.slice(0, 100));
    await Promise.all([d.waitForNavigation(), d.locator('#toasts .toast-act button', { hasText: 'Hoàn tác' }).first().click()]);
    check('undo restores line', (await d.locator('.cart-line').count()) === 3);
    // Xoá tất cả: Giữ lại, rồi xoá
    await d.click('form[action="/Cart/Clear"] button');
    await d.waitForSelector('#confirm-dialog[open]');
    check('clear dialog text', (await text(d, '#confirm-dialog')).includes('Xoá toàn bộ giỏ hàng?') && (await text(d, '#confirm-dialog')).includes('sản phẩm, mã khuyến mãi và ghi chú đang có trong giỏ sẽ bị xoá.'));
    await d.click('#confirm-dialog [data-confirm-cancel]');
    check('"Giữ lại" keeps cart', (await d.locator('.cart-line').count()) === 3);
    // Đặt hàng: ghi chú + thanh toán ví
    await d.fill('#checkout-note', 'Gọi trước khi giao');
    await d.check('#pay-ewallet');
    await d.waitForTimeout(700);
    await d.reload();
    check('note + payment kept after reload', (await d.inputValue('#checkout-note')) === 'Gọi trước khi giao' && await d.isChecked('#pay-ewallet'));
    await Promise.all([d.waitForURL(/\/don-hang\/.+\?moi=1/, { timeout: 20000 }), d.click('.place-desktop button')]);
    check('order placed → /don-hang/{code}', /\/don-hang\/DH\w+\?moi=1/.test(d.url()) && (await text(d, 'main')).includes('Đặt hàng thành công'), d.url());
    await d.goto(BASE + '/gio-hang');
    check('cart empty after order', (await text(d, 'main')).includes('Giỏ hàng của bạn đang trống'));

    // ------------------------------------------------------------ H. Khuyến mãi: "Dùng ngay" (khách vãng lai)
    const g = await newPage(390);
    await g.goto(BASE + '/khuyen-mai');
    const use = g.locator('form[action="/Cart/AttachCode"]').filter({ has: g.locator('input[value="CHAOBAN"]') });
    await use.locator('button').click();
    const ut = await toastText(g);
    check('Dùng ngay attaches code (no reload)', ut.includes('Đã gắn mã CHAOBAN vào giỏ hàng') && ut.includes('Mã được kiểm tra điều kiện khi bạn đặt hàng.') && g.url().endsWith('/khuyen-mai'), ut.slice(0, 120));
    await g.goto(BASE + '/gio-hang');
    check('empty cart mentions attached code', (await text(g, 'main')).includes('Mã CHAOBAN đã gắn sẵn'));
    await g.goto(BASE + '/khuyen-mai');
    check('guest sees member-code hint', (await text(g, '#ma-giam-gia')).includes('Đăng nhập để dùng mã thành viên'));
    // Chỉ nút đang hiện: ngoài giờ flash sale sáng, tab khung sáng bị ẩn (LOI-CAN-SUA #1).
    await g.locator('.pcard .qa-plus:visible').first().click();
    await toastText(g);
    await g.goto(BASE + '/gio-hang');
    const gm = await text(g, 'main');
    check('guest cart banner + login button', gm.includes('Đăng nhập để đặt hàng và nhận ưu đãi thành viên') && gm.includes('Đăng nhập để đặt hàng'));
    await g.screenshot({ path: `${OUT}/h-cart-guest-m.png`, fullPage: true });

    // ------------------------------------------------------------ I. Danh mục: sắp xếp và nhóm
    await g.goto(BASE + '/danh-muc/do-an-vat');
    await Promise.all([g.waitForNavigation(), g.selectOption('select[name=sapxep]', 'gia-tang')]);
    const prices = (await g.locator('.pcard .pcard-price .now b').allInnerTexts()).map(t => parseInt(t.replace(/\D/g, ''), 10));
    const firstSection = await g.locator('section').first().locator('.pcard .pcard-price .now b').allInnerTexts();
    const fs = firstSection.map(t => parseInt(t.replace(/\D/g, ''), 10));
    check('sort giá thấp → cao within section', g.url().includes('sapxep=gia-tang') && fs.every((v, i) => i === 0 || fs[i - 1] <= v), fs.slice(0, 6).join(','));
    await Promise.all([g.waitForNavigation(), g.locator('.cat-chips a', { hasText: 'Snacks' }).click()]);
    check('subcategory chip keeps sort', g.url().includes('nhom=snacks') && g.url().includes('sapxep=gia-tang') && (await g.locator('main section').count()) === 1, g.url());
    await g.goto(BASE + '/danh-muc/do-uong-co-con');
    check('18+ category notice', (await text(g, 'main')).includes('Chỉ bán cho khách từ đủ 18 tuổi.'));

    // ------------------------------------------------------------ J. 404
    for (const [path, expect] of [['/khong-co-trang-nay', 'Không tìm thấy trang bạn cần'], ['/Admin/khong-co', 'Không tìm thấy trang bạn cần'],
      ['/san-pham/khong-co', 'Không tìm thấy sản phẩm'], ['/danh-muc/khong-co', 'Không tìm thấy danh mục'], ['/Catalog/Product?slug=khong-co', 'Không tìm thấy sản phẩm']]) {
      const res = await g.goto(BASE + path);
      check(`404 ${path}`, res.status() === 404 && (await text(g, 'body')).includes(expect), String(res.status()));
    }
    // Đường dẫn cũ vẫn chạy
    for (const path of ['/Account/Login', '/Cart', '/Catalog/Category?slug=tra-sua', '/Catalog/Product?slug=hong-tra-sua-size-l', '/Store', '/Catalog/Search?q=sua', '/Home/Promotions', '/Account/Register']) {
      const res = await g.goto(BASE + path);
      check(`legacy ${path}`, res.status() === 200, String(res.status()));
    }
  } catch (e) {
    check('script crashed', false, e.message.split('\n')[0]);
    if (last) { console.log('CRASH URL', last.url()); await last.screenshot({ path: `${OUT}/crash.png`, fullPage: true }); }
  }
  console.log(results.join('\n'));
  console.log('BAD', results.filter(r => r.startsWith('BAD')).length, 'of', results.length);
  console.log('CONSOLE ERRORS', errors.length); errors.slice(0, 10).forEach(e => console.log(' ', e));
  await browser.close();
  const bad = results.filter(r => r.startsWith('BAD')).length + errors.length;
  console.log(bad ? `\n${bad} kiểm tra hỏng` : '\nTất cả đạt');
  process.exit(bad ? 1 : 0);
})();
