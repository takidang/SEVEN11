// Kịch bản trình duyệt cho các form khu quản lý: nhập sai phải báo lỗi đúng chỗ, nhập đúng phải lưu
// được và hiện ra ở danh sách; phân quyền chặn đúng người.
//   node e2e/admin-flows.cjs [baseUrl] [thư mục ảnh]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.argv[2] || process.env.BASE || 'http://localhost:5711';
const OUT = process.argv[3];
let failed = 0;
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'OK  ' : 'FAIL') + ' ' + msg); };
const stamp = Date.now().toString().slice(-6);

async function staff(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'vi-VN' });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/Admin/Account/Login');
  await page.fill('#email', email); await page.fill('#password', '123456');
  await Promise.all([page.waitForNavigation(), page.click('form.form button[type=submit]')]);
  return page;
}
// Bỏ kiểm tra HTML5 của trình duyệt để chắc rằng máy chủ tự bắt lỗi (người dùng có thể tắt JS / sửa HTML).
const submit = async (page, form = 'form.form, form.panel.form') => {
  await page.evaluate(() => document.querySelectorAll('form').forEach(f => { f.noValidate = true; }));
  return Promise.all([page.waitForNavigation(), page.locator(`${form} button[type=submit]`).last().click()]);
};
const flash = async page => (await page.locator('.flash-ok').count()) ? (await page.locator('.flash-ok').first().innerText()).trim() : '';
const errors = async page => page.locator('.field-error:visible').allInnerTexts();
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); };

(async () => {
  const browser = await chromium.launch();
  const admin = await staff(browser, 'admin@7eleven.demo');

  // ---------------------------------------------------------------- sản phẩm
  await admin.goto(BASE + '/Admin/Products/Edit');
  await admin.fill('[name=Name]', '');
  await admin.fill('[name=Price]', '');
  await submit(admin, 'form[data-product-form]');
  const productErrors = await errors(admin);
  ok(productErrors.length >= 2, `sản phẩm trống báo lỗi: ${productErrors.slice(0, 3).join(' | ')}`);
  await shot(admin, 'product-errors');
  const productName = `Bánh thử nghiệm ${stamp}`;
  await admin.fill('[name=Name]', productName);
  await admin.selectOption('[name=CategoryId]', { index: 1 });
  await admin.evaluate(() => {
    const sub = document.querySelector('[name=SubcategoryId]');
    const opt = [...sub.options].find(o => o.value && !o.hidden && !o.disabled);
    if (opt) { sub.value = opt.value; sub.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await admin.fill('[name=Price]', '25000');
  await admin.fill('[name=CostPrice]', '15000');
  await admin.fill('[name=Brand]', '7-Eleven');
  if (await admin.locator('[name=Origin]').count()) await admin.fill('[name=Origin]', 'Việt Nam');
  if (await admin.locator('[name=Unit]').evaluate(e => e.tagName) === 'SELECT') await admin.selectOption('[name=Unit]', { index: 1 });
  else await admin.fill('[name=Unit]', 'cái');
  const fillButtons = admin.locator('[data-fill]');
  for (let i = 0; i < await fillButtons.count(); i++) await fillButtons.nth(i).click();
  const ean = admin.locator('[data-ean13]');
  if (await ean.count()) await ean.first().click();
  await submit(admin, 'form[data-product-form]');
  ok(/sản phẩm/i.test(await flash(admin)), `thêm sản phẩm: ${await flash(admin)} ${(await errors(admin)).join(' | ')}`);
  await admin.goto(BASE + '/Admin/Products?q=' + encodeURIComponent(productName));
  ok((await admin.locator(`text=${productName}`).count()) > 0, 'sản phẩm mới có trong danh sách');
  // Bỏ tích "Sản phẩm mới" rồi lưu phải lưu là tắt (ô tích tắt không gửi gì, trước đây máy chủ giữ mặc định bật).
  await Promise.all([admin.waitForNavigation(), admin.locator('tr', { hasText: productName }).locator('a[href*="/Products/Edit/"]').first().click()]);
  const editUrl = admin.url();
  await admin.locator('input[name=IsNew][type=checkbox]').uncheck();
  await submit(admin, 'form[data-product-form]');
  await admin.goto(editUrl);
  ok(!(await admin.locator('input[name=IsNew][type=checkbox]').isChecked()), 'bỏ tích "Sản phẩm mới" thì lưu là tắt');

  // ---------------------------------------------------------------- khuyến mãi
  await admin.goto(BASE + '/Admin/Promotions/Edit');
  await admin.fill('[name=Name]', '');
  await submit(admin, 'form[data-promotion-form]');
  ok((await errors(admin)).length >= 1, `khuyến mãi trống báo lỗi: ${(await errors(admin)).slice(0, 2).join(' | ')}`);
  await admin.fill('[name=Name]', `Giảm thử ${stamp}`);
  const types = await admin.locator('[name=Type]').evaluateAll(els => els.map(e => e.value));
  const percent = types.find(t => /Percent/i.test(t)) || types[0];
  await admin.locator(`[name=Type][value="${percent}"]`).check();
  await admin.fill('[name=Code]', `THU${stamp}`);
  await admin.fill('[name=Value]', '150');
  await submit(admin, 'form[data-promotion-form]');
  ok((await errors(admin)).some(e => /%|phần trăm|1 đến|100/.test(e)), `giảm 150% bị chặn: ${(await errors(admin)).join(' | ')}`);
  await admin.fill('[name=Value]', '10');
  await submit(admin, 'form[data-promotion-form]');
  ok(/khuyến mãi|Đã tạo|Đã lưu/i.test(await flash(admin)), `tạo khuyến mãi: ${await flash(admin)} ${(await errors(admin)).join(' | ')}`);

  // ---------------------------------------------------------------- nhà cung cấp
  await admin.goto(BASE + '/Admin/Suppliers/Edit');
  await admin.fill('[name=Name]', `NCC thử ${stamp}`);
  await admin.fill('[name=TaxCode]', '123');
  await admin.fill('[name=Phone]', '0281234');
  await submit(admin);
  const supErrors = await errors(admin);
  ok(supErrors.length >= 1, `NCC sai mã số thuế/SĐT báo lỗi: ${supErrors.join(' | ')}`);
  await admin.fill('[name=ContactName]', 'Nguyễn Văn Thử');
  await admin.fill('[name=TaxCode]', ('03' + Date.now()).slice(-10));
  await admin.fill('[name=Phone]', '0281234567');
  await admin.fill('[name=Email]', `ncc${stamp}@example.com`);
  await admin.fill('[name=Address]', '12 Đường Thử, Quận 1, TP Hồ Chí Minh');
  const cat = admin.locator('[name=CategoryIds]');
  if (await cat.count()) await cat.first().check();
  await submit(admin);
  ok(/nhà cung cấp/i.test(await flash(admin)), `thêm NCC: ${await flash(admin)} ${(await errors(admin)).join(' | ')}`);

  // ---------------------------------------------------------------- nhân viên + lịch ca
  await admin.goto(BASE + '/Admin/Staff/Employee');
  await admin.fill('[name=FullName]', 'A');
  await admin.fill('[name=Email]', 'sai-email');
  await submit(admin);
  ok((await errors(admin)).length >= 2, `nhân viên sai báo lỗi: ${(await errors(admin)).join(' | ')}`);
  await admin.fill('[name=FullName]', `Trần Thử ${stamp}`);
  await admin.fill('[name=Email]', `nv${stamp}@7eleven.demo`);
  await admin.fill('[name=Phone]', `09${stamp}12`);
  const storeSel = admin.locator('select[name=StoreId]');
  if (await storeSel.count()) await storeSel.selectOption({ index: 1 });
  await submit(admin);
  ok(/nhân viên/i.test(await flash(admin)), `thêm nhân viên: ${await flash(admin)} ${(await errors(admin)).join(' | ')}`);

  // ---------------------------------------------------------------- khách hàng
  await admin.goto(BASE + '/Admin/Customers?q=0901234567');
  const customerLink = admin.locator('a[href*="/Admin/Customers/Detail"]').first();
  ok(await customerLink.count() > 0, 'tìm khách theo SĐT');
  await Promise.all([admin.waitForNavigation(), customerLink.click()]);
  const editToggle = admin.locator('details.inline-dialog:has(form[action*="Profile"]) > summary');
  if (await editToggle.count() && !(await admin.locator('form[action*="Profile"] [name=email]').isVisible())) await editToggle.first().click();
  await admin.fill('[name=email]', 'khong-hop-le');
  await submit(admin, 'form[action*="Profile"]');
  ok(/Email (chưa đúng định dạng|không hợp lệ)/.test(await admin.content()), 'email khách sai bị chặn');
  await shot(admin, 'customer-profile-error');

  // ---------------------------------------------------------------- kho: điều chỉnh có lý do
  await admin.goto(BASE + '/Admin/Stock');
  if (await admin.locator('form[action*="/Admin/Scope"] select, select[name=storeId]').count()) {
    // quản trị phải chọn cửa hàng trước khi điều chỉnh kho
  }
  const manager = await staff(browser, 'quanly1006@7eleven.demo');
  await manager.goto(BASE + '/Admin/Stock');
  const adjustLink = manager.locator('a[href*="adjust="]').first();
  ok(await adjustLink.count() > 0, 'có nút điều chỉnh tồn');
  await Promise.all([manager.waitForNavigation(), adjustLink.click()]);
  const qty = manager.locator('form[data-adjust] [name=quantity]');
  const system = +(await manager.locator('form[data-adjust]').getAttribute('data-system'));
  await qty.fill(String(system + 2));
  await manager.selectOption('form[data-adjust] [name=reason]', 'Khác');
  await Promise.all([manager.waitForNavigation(), manager.locator('form[data-adjust] button[type=submit]').click()]);
  ok((await manager.content()).includes('Ghi rõ lý do điều chỉnh'), '"Khác" không ghi chú bị chặn');
  await manager.locator('form[data-adjust] [name=quantity]').fill(String(system + 2));
  await manager.selectOption('form[data-adjust] [name=reason]', 'Khác');
  await manager.fill('form[data-adjust] [name=note]', 'Kiểm thử tự động');
  await Promise.all([manager.waitForNavigation(), manager.locator('form[data-adjust] button[type=submit]').click()]);
  ok(/Đã điều chỉnh tồn/.test(await flash(manager)), `điều chỉnh tồn: ${await flash(manager)}`);
  await manager.goto(BASE + '/Admin/Stock/Movements');
  ok((await manager.content()).includes('Kiểm thử tự động'), 'nhật ký kho ghi lý do/ghi chú');

  // ---------------------------------------------------------------- tổng quan, đơn hàng, báo cáo kỳ tuỳ chọn
  await admin.goto(BASE + '/Admin');
  const dash = await admin.locator('body').innerText();
  ok(['Doanh thu theo giờ', 'Kênh bán (7 ngày)', 'Doanh thu theo cửa hàng (7 ngày)', 'Top sản phẩm bán chạy (7 ngày)', 'Đơn online đang xử lý'].every(t => dash.includes(t)), 'tổng quan có đủ các khối');
  await admin.goto(BASE + '/Admin/Orders?view=list&period=tat-ca');
  await admin.fill('input[name=q]', 'tran thu ha');
  await Promise.all([admin.waitForNavigation(), admin.press('input[name=q]', 'Enter')]);
  const found = await admin.locator('table a.code-link').count();
  ok(found > 0, `tìm đơn theo tên không dấu: ${found} đơn`);
  ok(await admin.locator('a:has-text("Xoá bộ lọc")').count() === 1, 'có nút "Xoá bộ lọc"');
  await Promise.all([admin.waitForNavigation(), admin.click('a:has-text("Xoá bộ lọc")')]);
  ok(!admin.url().includes('q='), 'xoá bộ lọc về mặc định');
  await admin.goto(BASE + '/Admin/Reports');
  await admin.selectOption('[data-period]', 'tuy-chon');
  ok(await admin.locator('[data-range]').isVisible(), 'chọn "Tuỳ chọn" hiện ô ngày');
  const today = new Date();
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  await admin.fill('input[name=from]', iso(new Date(today.getTime() - 9 * 86400000)));
  await admin.fill('input[name=to]', iso(today));
  await Promise.all([admin.waitForNavigation(), admin.click('[data-range] button[type=submit]')]);
  ok(/· 10 ngày/.test(await admin.locator('.page-head').innerText()), 'kỳ tuỳ chọn 10 ngày hiện đúng');

  // ---------------------------------------------------------------- báo cáo CSV
  const csv = await manager.evaluate(async () => {
    const r = await fetch('/Admin/Reports/Export?tab=doanh-thu&period=7-ngay');
    const buf = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type'), bom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, size: buf.length };
  });
  ok(csv.status === 200 && csv.bom && /text\/csv/.test(csv.type) && csv.size > 200, `xuất CSV ${JSON.stringify(csv)}`);

  // ---------------------------------------------------------------- phân quyền
  await manager.goto(BASE + '/Admin/Products/Edit');
  ok(!(await manager.locator('form[data-product-form]').count()), 'quản lý không mở được form thêm sản phẩm');
  const token = await manager.evaluate(() => document.querySelector('input[name=__RequestVerificationToken]')?.value);
  const post = await manager.evaluate(async t => {
    const fd = new FormData(); fd.append('__RequestVerificationToken', t || ''); fd.append('Name', 'Hack'); fd.append('Price', '1');
    const r = await fetch('/Admin/Products/Save', { method: 'POST', body: fd, redirect: 'follow' });
    return { status: r.status, url: r.url };
  }, token);
  ok(post.status === 403 || /Denied/i.test(post.url) || post.status === 400, `quản lý POST lưu sản phẩm bị chặn ${JSON.stringify(post)}`);
  const cashier = await staff(browser, 'thungan1006@7eleven.demo');
  for (const path of ['/Admin/Products', '/Admin/Reports', '/Admin/Stores', '/Admin/Staff', '/Admin/Stock']) {
    await cashier.goto(BASE + path);
    ok(/Denied|Pos/i.test(cashier.url()) || (await cashier.content()).includes('không có quyền'), `thu ngân bị chặn ${path} → ${cashier.url().replace(BASE, '')}`);
  }

  for (const p of [admin, manager, cashier]) ok(p.errors.length === 0, `không lỗi JS (${p.errors.slice(0, 2).join(' | ')})`);
  await browser.close();
  console.log(failed ? `\n${failed} kiểm tra hỏng` : '\nTất cả đạt');
  process.exit(failed ? 1 : 0);
})();
