// Kịch bản quầy bán hàng (thu ngân 1006): vào ca, thêm hàng, tạm giữ / mở lại bill, chặn vượt tồn,
// quét mã không có, thanh toán tiền mặt (thiếu tiền bị chặn) và thẻ, hoá đơn → Enter đơn mới, kết ca.
//   node e2e/pos-flow.cjs [baseUrl] [thư mục ảnh]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.argv[2] || process.env.BASE || 'http://localhost:5711';
const OUT = process.argv[3];
let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };
(async () => {
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(BASE + '/Admin/Account/Login');
  await p.fill('#email', 'thungan1006@7eleven.demo'); await p.fill('#password', '123456');
  await Promise.all([p.waitForNavigation(), p.click('form.form button[type=submit]')]);
  await p.goto(BASE + '/Admin/Pos');
  // 1. vào ca
  const chip = p.locator('.shift-chip');
  ok(await chip.count() === 1, 'shift chip shown: ' + (await chip.innerText()).replace(/\s+/g, ' '));
  if ((await chip.innerText()).includes('Chưa vào ca')) {
    await chip.click();
    await p.waitForSelector('#checkin-dialog[open]');
    if (OUT) await p.screenshot({ path: `${OUT}/pos-checkin.png` });
    await Promise.all([p.waitForNavigation(), p.click('#checkin-dialog button[type=submit]')]);
    ok((await p.locator('.flash-ok').innerText()).includes('Đã vào'), 'check-in toast: ' + await p.locator('.flash-ok').innerText());
  }
  // 2. thêm hàng
  const tiles = p.locator('form.tile:not(.sold-out) button[type=submit]');
  await tiles.nth(0).click(); await p.waitForTimeout(400);
  await tiles.nth(1).click(); await p.waitForTimeout(400);
  ok((await p.locator('#bill .bill-lines li').count()) === 2, 'two lines in bill');
  // 3. tạm giữ
  await p.click('#bill form[action$="/Hold"] button'); await p.waitForTimeout(400);
  ok((await p.locator('#bill .flash-ok').innerText()).startsWith('Đã tạm giữ bill'), 'hold toast: ' + await p.locator('#bill .flash-ok').innerText());
  ok((await p.locator('#bill .bill-lines li').count()) === 0, 'bill empty after hold');
  await tiles.nth(2).click(); await p.waitForTimeout(400);
  await p.click('[data-open-dialog="held-dialog"]'); await p.waitForSelector('#held-dialog[open]');
  if (OUT) await p.screenshot({ path: `${OUT}/pos-held.png` });
  await p.click('#held-dialog .held-list form[action$="/Restore"] button'); await p.waitForTimeout(400);
  ok((await p.locator('#bill .flash-ok').innerText()).startsWith('Đã mở lại bill #'), 'restore toast: ' + await p.locator('#bill .flash-ok').innerText());
  ok((await p.locator('#bill .bill-lines li').count()) === 2, 'restored 2 lines');
  ok((await p.locator('#bill .count-dot').innerText()) === '1', 'swapped bill now held (1)');
  // 4. vượt tồn: đặt số lượng lớn qua nút + nhiều lần không được; gọi thẳng Set 999
  const token = await p.locator('#bill input[name=__RequestVerificationToken]').first().inputValue();
  const pid = await p.locator('#bill form[action$="/Set"] input[name=productId]').first().inputValue();
  const html = await p.evaluate(async ({ token, pid }) => {
    const fd = new FormData(); fd.append('__RequestVerificationToken', token); fd.append('productId', pid); fd.append('quantity', '999');
    const r = await fetch('/Admin/Pos/Set', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'fetch' } }); return r.text();
  }, { token, pid });
  const m = html.match(/flash flash-error" role="status">([^<]*)</);
  ok(m && m[1].startsWith('Cửa hàng chỉ còn'), 'stock cap message: ' + (m && m[1]));
  await p.goto(BASE + '/Admin/Pos');
  // 5. quét mã không có
  await p.fill('[data-pos-search]', '89300000001'); await Promise.all([p.waitForNavigation(), p.press('[data-pos-search]', 'Enter')]);
  ok((await p.locator('.flash-error').innerText()).includes('Không tìm thấy sản phẩm có mã vạch 89300000001'), 'scan miss message');
  // 6. thanh toán: F9, thiếu tiền, đủ tiền
  await p.keyboard.press('F9');
  await p.waitForSelector('#pay-dialog[open]');
  await p.fill('[data-cash]', '1000');
  await p.click('#pay-dialog button[data-pay]');
  ok(await p.locator('[data-pay-error]').isVisible() && (await p.locator('[data-pay-error]').innerText()) === 'Tiền khách đưa chưa đủ', 'cash short blocked');
  if (OUT) await p.screenshot({ path: `${OUT}/pos-pay-short.png` });
  await p.click('#pay-dialog label.pay-method:nth-child(4)');
  if (OUT) await p.screenshot({ path: `${OUT}/pos-pay-qr.png` });
  ok((await p.locator('[data-pay-label]').innerText()) === 'Đã nhận tiền', 'QR label');
  await p.click('#pay-dialog label.pay-method:nth-child(1)');
  await p.click('#pay-dialog [data-quick]');
  const age = p.locator('[data-age]'); if (await age.count()) await age.check();
  await Promise.all([p.waitForNavigation(), p.click('#pay-dialog button[data-pay]')]);
  ok(p.url().includes('/Admin/Pos/Receipt/'), 'receipt after pay: ' + p.url());
  if (OUT) await p.screenshot({ path: `${OUT}/pos-receipt.png` });
  await p.locator('body').click({ position: { x: 5, y: 400 } });
  await Promise.all([p.waitForNavigation(), p.keyboard.press('Enter')]);
  ok(p.url().endsWith('/Admin/Pos'), 'Enter -> new order: ' + p.url());
  // 7. thanh toán thẻ với bill giữ còn lại
  await p.click('[data-open-dialog="held-dialog"]'); await p.waitForSelector('#held-dialog[open]');
  await p.click('#held-dialog .held-list form[action$="/Restore"] button'); await p.waitForTimeout(400);
  await p.click('[data-pay-open]'); await p.waitForSelector('#pay-dialog[open]');
  await p.click('#pay-dialog label.pay-method:nth-child(2)');
  ok((await p.locator('[data-pay-label]').innerText()) === 'Đã quẹt thẻ thành công', 'card label');
  const age2 = p.locator('[data-age]'); if (await age2.count()) await age2.check();
  await Promise.all([p.waitForNavigation(), p.click('#pay-dialog button[data-pay]')]);
  ok(p.url().includes('/Receipt/'), 'card payment receipt');
  await p.goto(BASE + '/Admin/Pos');
  // 8. kết ca
  await p.click('.shift-chip');
  if (OUT) await p.screenshot({ path: `${OUT}/pos-shift-pop.png` });
  await p.click('[data-open-dialog="checkout-dialog"]');
  await p.waitForSelector('#checkout-dialog[open]');
  await p.fill('#checkout-dialog input[name=closingCash]', '1.000.000');
  ok((await p.locator('[data-shift-diff]').innerText()).includes('thiếu'), 'checkout diff: ' + await p.locator('[data-shift-diff]').innerText());
  if (OUT) await p.screenshot({ path: `${OUT}/pos-checkout.png` });
  await Promise.all([p.waitForNavigation(), p.click('#checkout-dialog button[type=submit]')]);
  ok((await p.locator('.flash-ok').innerText()).includes('Đã kết'), 'checkout toast: ' + await p.locator('.flash-ok').innerText());
  ok(errors.length === 0, 'không lỗi JS ' + errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} kiểm tra hỏng` : '\nTất cả đạt');
  process.exit(failed ? 1 : 0);
})();
