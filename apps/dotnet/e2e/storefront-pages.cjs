// Kịch bản trình duyệt cho các trang khách còn lại: tìm kiếm (độ phù hợp, sắp xếp, gợi ý), theo dõi đơn
// (tiến trình, tự cập nhật khi cửa hàng chuyển bước, che số với người lạ, Mua lại, huỷ qua hộp thoại, 404)
// và Hệ thống cửa hàng (lọc tỉnh, tìm không dấu, "Gần tôi", "Giao từ cửa hàng này").
//   node e2e/storefront-pages.cjs [baseUrl] [thư mục ảnh]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.argv[2] || process.env.BASE || 'http://localhost:5711';
const OUT = process.argv[3] || require('os').tmpdir();
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  {

  const page = async (w = 1280) => { const p = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); }); return p; };
  // tìm kiếm
  const g = await page();
  await g.goto(BASE + '/tim-kiem');
  ok((await g.locator('h1').innerText()) === 'Tìm kiếm sản phẩm' && await g.locator('.popular-chip').count() === 6, 'tìm kiếm: trang trống có từ khoá phổ biến');
  await g.screenshot({ path: OUT + '/search-empty.png', fullPage: true });
  await g.goto(BASE + '/tim-kiem?q=m%C3%AC');
  const names = await g.locator('.pcard-name').allInnerTexts();
  ok(names.length > 0 && /^M[ìi]/i.test(names[0]), 'tìm "mì": kết quả đầu là mì (' + names.slice(0, 3).join(' | ') + ')');
  ok(!names.some(n => /Milo|Milk/i.test(n)), 'tìm "mì": không lẫn Milo/Milk');
  await g.screenshot({ path: OUT + '/search-mi.png', fullPage: true });
  await g.goto(BASE + '/tim-kiem?q=bia&sapxep=gia-tang');
  ok(await g.locator('.related-groups a').count() > 0, 'tìm "bia": có danh mục liên quan');
  ok((await g.locator('select[name=sapxep]').inputValue()) === 'gia-tang', 'tìm kiếm giữ sắp xếp');
  await g.goto(BASE + '/tim-kiem?q=xyzkhongco');
  ok(/Không tìm thấy sản phẩm nào cho “xyzkhongco”/.test(await g.locator('main').innerText()) && await g.locator('.search-empty .popular-chip').count() === 6, 'tìm không ra: thông báo + gợi ý + "Đang giảm giá"');
  // đặt đơn
  const m = await page();
  await m.goto(BASE + '/dang-nhap');
  await m.fill('form:visible input[name=phone]', '0912345678'); await m.fill('form:visible input[type=password]', '123456');
  await Promise.all([m.waitForNavigation(), m.locator('form:visible button[type=submit]').first().click()]);
  await m.goto(BASE + '/danh-muc/do-an-vat');
  await m.locator('.pcard form[action="/Cart/Add"] button').first().click();
  await m.waitForTimeout(800);
  await m.goto(BASE + '/gio-hang');
  await Promise.all([m.waitForURL(/\/don-hang\/.+\?moi=1/, { timeout: 20000 }), m.click('.place-desktop button')]);
  const url = m.url(); const code = url.match(/don-hang\/(DH\d+)/)[1];
  ok(/Đặt hàng thành công/.test(await m.locator('main').innerText()), 'đặt xong có banner "Đặt hàng thành công" (' + code + ')');
  ok(await m.locator('.op-steps li').count() === 5 && await m.locator('.op-steps li.current').count() === 1, 'tiến trình 5 bước, đang ở bước 1');
  await m.screenshot({ path: OUT + '/order-owner.png', fullPage: true });
  const mm = await page(390);
  await mm.goto(BASE + '/don-hang/' + code);
  ok(/\*\*\*/.test(await mm.locator('.op-delivery').innerText()), 'khách lạ chỉ thấy số đã che');
  ok(await mm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'trang đơn không tràn ngang ở 390px');
  await mm.screenshot({ path: OUT + '/order-guest-m.png', fullPage: true });
  // quản lý chuyển bước → trang chủ đơn tự cập nhật
  const a = await page();
  await a.goto(BASE + '/Admin/Account/Login');
  await a.fill('#email', 'admin@7eleven.demo'); await a.fill('#password', '123456');
  await Promise.all([a.waitForNavigation(), a.click('form.form button[type=submit]')]);
  await a.goto(BASE + '/Admin/Orders/Detail/' + code);
  await Promise.all([a.waitForNavigation(), a.locator('form[action*="Advance"] button').first().click()]);
  await m.waitForURL(/capnhat=1/, { timeout: 25000 }).catch(() => {});
  ok(/Cửa hàng đã xác nhận đơn hàng của bạn/.test(await m.locator('body').innerText()), 'trang đơn tự cập nhật + báo "Cửa hàng đã xác nhận"');
  ok(await m.locator('.op-steps li.done').count() === 1, 'bước 1 đã xong, bước 2 đang chạy');
  ok(await m.locator('button:has-text("Huỷ đơn")').count() === 0, 'đã xác nhận thì không còn nút huỷ');
  // mua lại
  await Promise.all([m.waitForURL(/gio-hang/), m.click('button:has-text("Mua lại")')]);
  ok(/Đã thêm \d+ sản phẩm vào giỏ hàng/.test(await m.locator('body').innerText()), '"Mua lại" thêm vào giỏ và mở giỏ hàng');
  // đặt đơn mới rồi huỷ qua hộp thoại
  await Promise.all([m.waitForURL(/\/don-hang\/.+\?moi=1/, { timeout: 20000 }), m.click('.place-desktop button')]);
  await m.click('button:has-text("Huỷ đơn")');
  await m.waitForSelector('#confirm-dialog[open]');
  ok(/Giữ đơn/.test(await m.locator('#confirm-dialog').innerText()), 'hộp thoại huỷ có "Giữ đơn"');
  await Promise.all([m.waitForNavigation(), m.click('#confirm-dialog [data-confirm-ok]')]);
  ok(/Đơn hàng đã bị huỷ/.test(await m.locator('main').innerText()) && /Khách huỷ trên web/.test(await m.locator('main').innerText()), 'huỷ xong hiện lý do "Khách huỷ trên web" + lịch sử');
  await m.screenshot({ path: OUT + '/order-cancelled.png', fullPage: true });
  // đơn tại quầy + không tồn tại
  await a.goto(BASE + '/Admin/Orders?view=list&period=7-ngay&channel=InStore');
  const instore = (await a.locator('a.code-link').first().innerText()).trim();
  await g.goto(BASE + '/don-hang/' + instore);
  ok(/Đã mua tại cửa hàng/.test(await g.locator('main').innerText()), 'đơn tại quầy: "Đã mua tại cửa hàng"');
  const nf = await g.goto(BASE + '/don-hang/DH0000000000');
  ok(nf.status() === 404 && /Không tìm thấy đơn hàng DH0000000000/.test(await g.locator('main').innerText()), 'mã sai: 404 "Không tìm thấy đơn hàng"');
  
  }
  {

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 21.0285, longitude: 105.8542 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.goto(BASE + '/cua-hang');
  const visible = async () => p.locator('[data-store]:not([hidden])').count();
  ok(await visible() === 10 && (await p.locator('[data-count]').innerText()) === '10', 'khách: thấy cả 10 cửa hàng');
  await p.click('[data-province-chip="Hà Nội"]');
  ok(await visible() === 3 && (await p.locator('[data-count]').innerText()) === '3', 'lọc Hà Nội: 3 cửa hàng');
  await p.click('[data-province-chip=""]');
  await p.fill('[data-store-search]', 'nguyen du');
  await p.waitForTimeout(300);
  const names = await p.locator('[data-store]:not([hidden])').evaluateAll(els => els.map(e => e.getAttribute('data-label')));
  ok(names.some(n => n.startsWith('1006')) && names.length < 10, 'tìm "nguyen du" (không dấu): có 1006 — ' + names.join(', '));
  await p.fill('[data-store-search]', 'khongco');
  await p.waitForTimeout(300);
  ok(await p.locator('[data-store-empty]').isVisible(), 'không có kết quả: hiện "Không tìm thấy cửa hàng phù hợp"');
  await p.fill('[data-store-search]', '');
  await p.waitForTimeout(300);
  await p.click('[data-near-me]');
  await p.waitForFunction(() => (document.querySelector('[data-near-suffix]').textContent || '').includes('gần bạn nhất'), null, { timeout: 15000 });
  const first = await p.locator('[data-store]:not([hidden]) .sd-name').first().innerText();
  ok(/Đã sắp xếp theo cửa hàng gần bạn nhất/.test(await p.locator('#toasts').innerText()) && (await p.locator('[data-store]:not([hidden])').first().getAttribute('data-province')) === 'Hà Nội', '"Gần tôi" (Hà Nội): xếp gần nhất trước, mở đúng tỉnh — ' + first);
  ok(/cách/.test(await p.locator('[data-store]:not([hidden]) [data-distance]').first().innerText()), 'thẻ cửa hàng có "· cách …"');
  await p.screenshot({ path: OUT + '/stores-near.png', fullPage: true });
  // thành viên chọn cửa hàng giao
  await p.goto(BASE + '/dang-nhap');
  await p.fill('form:visible input[name=phone]', '0901234567'); await p.fill('form:visible input[type=password]', '123456');
  await Promise.all([p.waitForNavigation(), p.locator('form:visible button[type=submit]').first().click()]);
  await p.goto(BASE + '/cua-hang');
  ok((await p.locator('.sd-selected').innerText()).includes('Đơn online đang giao từ cửa hàng'), 'thành viên: thấy cửa hàng đang giao');
  const target = p.locator('[data-store]:not([hidden])').filter({ has: p.locator('button:has-text("Giao từ cửa hàng này")') }).first();
  const label = await target.getAttribute('data-label');
  await Promise.all([p.waitForNavigation(), target.locator('button:has-text("Giao từ cửa hàng này")').click()]);
  ok(new RegExp('Đã chọn cửa hàng ' + label.split(' – ')[0]).test(await p.locator('#toasts').innerText()), 'chọn "Giao từ cửa hàng này" → báo đã chọn ' + label);
  ok((await p.locator('.sd-selected').innerText()).includes(label.split(' – ')[0]), 'dải trên cùng đổi sang cửa hàng vừa chọn');
  ok(await p.locator('button:has-text("Đang giao từ đây")').count() === 1, 'thẻ được chọn ghi "Đang giao từ đây"');
  await p.goto(BASE + '/san-pham/hong-tra-sua-size-l');
  ok((await p.locator('main').innerText()).includes('tại cửa hàng ' + label.split(' – ')[0]), 'trang sản phẩm báo tồn tại cửa hàng vừa chọn');
  const pm = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await pm.goto(BASE + '/cua-hang');
  ok(await pm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'không tràn ngang ở 390px');
  await pm.screenshot({ path: OUT + '/stores-m.png', fullPage: true });
  
  }
  {
    // Hộp thoại xác nhận riêng (không dùng confirm của trình duyệt): đổi sao, xoá địa chỉ.
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    let native = 0; p.on('dialog', d => { native++; d.accept(); });
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/dang-nhap');
    await p.fill('form:visible input[name=phone]', '0912345678'); await p.fill('form:visible input[type=password]', '123456');
    await Promise.all([p.waitForNavigation(), p.locator('form:visible button[type=submit]').first().click()]);
    await p.goto(BASE + '/tai-khoan?tab=sao-vang');
    await p.locator('form.reward button:not([disabled])').first().click();
    await p.waitForSelector('#confirm-dialog[open]');
    ok(/sao lấy voucher/.test(await p.locator('#confirm-dialog .modal-title').innerText()), 'đổi sao hỏi bằng hộp thoại riêng');
    await Promise.all([p.waitForNavigation(), p.click('#confirm-dialog [data-confirm-ok]')]);
    ok(/Đã đổi voucher/.test(await p.locator('body').innerText()), 'đổi sao thành công');
    await p.goto(BASE + '/tai-khoan?tab=dia-chi');
    const del = p.locator('form[action*="DeleteAddress"] button');
    if (await del.count()) {
      await del.last().click();
      await p.waitForSelector('#confirm-dialog[open]');
      ok((await p.locator('#confirm-dialog [data-confirm-cancel]').innerText()) === 'Giữ lại', 'xoá địa chỉ hỏi "Giữ lại / Xoá địa chỉ"');
      await p.click('#confirm-dialog [data-confirm-cancel]');
    }
    ok(native === 0, 'không còn hộp confirm mặc định của trình duyệt');
  }
  ok(errors.length === 0, 'không lỗi JS ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(bad ? `\n${bad} kiểm tra hỏng` : '\nTất cả đạt');
  process.exit(bad ? 1 : 0);
})();
