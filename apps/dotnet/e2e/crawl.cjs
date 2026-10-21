// Bò đồ thị trang: đăng nhập theo từng vai trò rồi đi hết mọi liên kết nội bộ (BFS), mỗi trang kiểm
//   - mã HTTP (4xx/5xx), trang lỗi máy chủ, lỗi JavaScript / console
//   - chữ Razor lọt ra ngoài (@if, @foreach, @Model…), ảnh nội bộ không tải được
//   - tràn ngang ở bề rộng điện thoại 390px
// Mỗi "dạng đường dẫn" (số, mã thay bằng *) chỉ đi tối đa vài trang để không bò hết 32 nghìn đơn.
//
//   node e2e/crawl.cjs [baseUrl] [vai trò…]      vai trò: guest member cashier manager admin
//   PLAYWRIGHT_PATH=… nếu playwright không nằm trong node_modules gần đó.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const BASE = (process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : process.env.BASE) || 'http://localhost:5711';
const roles = process.argv.slice(2).filter(a => !a.startsWith('http'));
const ROLES = roles.length ? roles : ['guest', 'member', 'cashier', 'manager', 'admin'];
const MAX_PAGES = +(process.env.MAX_PAGES || 450);
const PER_PATTERN = +(process.env.PER_PATTERN || 3);
const STAFF = { cashier: 'thungan1006@7eleven.demo', manager: 'quanly1006@7eleven.demo', admin: 'admin@7eleven.demo' };
// Không bấm những liên kết làm đổi trạng thái phiên hoặc xoá dữ liệu.
const SKIP = [/\/Logout/i, /\/dang-xuat/i, /\/Demo\/Reset/i, /\/Export/i, /^\/Admin\/Scope/i];

function pattern(url) {
  const u = new URL(url);
  const path = u.pathname.replace(/\/(DH|PN|NV|NCC|cu-|em-|st-|pr-|od-|sh-)[^/]*/gi, '/*').replace(/\/[0-9a-f-]{6,}(?=\/|$)/gi, '/*').replace(/\d+/g, '#');
  const keys = [...u.searchParams.keys()].sort().join('&');
  return `${path}?${keys}`;
}

async function login(page, role) {
  if (STAFF[role]) {
    await page.goto(BASE + '/Admin/Account/Login');
    await page.fill('#email', STAFF[role]);
    await page.fill('#password', '123456');
    await Promise.all([page.waitForNavigation(), page.click('form.form button[type=submit]')]);
    return [BASE + '/Admin'];
  }
  if (role === 'member') {
    await page.goto(BASE + '/Account/Login');
    await page.fill('input[name=phone]', '0901234567');
    await page.fill('input[name=password]', '123456');
    await Promise.all([page.waitForNavigation(), page.click('form[action*="Login"] button[type=submit], form[action*="dang-nhap"] button[type=submit]')]);
    return [BASE + '/', BASE + '/Account'];
  }
  return [BASE + '/'];
}

async function crawl(browser, role) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'vi-VN' });
  const page = await context.newPage();
  const issues = [];
  const notes = new Set();
  let current = '';
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) issues.push(`[console] ${current} :: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => issues.push(`[js] ${current} :: ${e.message.slice(0, 200)}`));
  page.on('dialog', d => d.dismiss());

  const queue = await login(page, role);
  const seen = new Set(queue);
  const perPattern = new Map();
  let visited = 0;
  while (queue.length && visited < MAX_PAGES) {
    const url = queue.shift();
    const key = pattern(url);
    if ((perPattern.get(key) || 0) >= PER_PATTERN) continue;
    perPattern.set(key, (perPattern.get(key) || 0) + 1);
    current = url.replace(BASE, '');
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    } catch (e) {
      issues.push(`[timeout] ${current} :: ${e.message.split('\n')[0]}`);
      continue;
    }
    visited++;
    const status = response ? response.status() : 0;
    const finalUrl = page.url();
    if (!finalUrl.startsWith(BASE)) continue;
    const info = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const html = document.documentElement.outerHTML;
      const leaks = (text.match(/@(if|foreach|for|switch|Model|Html|await)\b|@\(/g) || []).slice(0, 3);
      const handled = i => i.dataset.fallback || i.classList.contains('img-failed');
      const brokenImages = [...document.images].filter(i => i.getAttribute('src') && !i.hidden && i.complete && i.naturalWidth === 0 && !handled(i)).map(i => i.getAttribute('src')).slice(0, 3);
      const fallbacks = [...document.images].filter(handled).map(i => i.alt || '(không có alt)').slice(0, 3);
      const links = [...document.querySelectorAll('a[href]')].filter(a => !a.hasAttribute('download')).map(a => a.href);
      return {
        title: document.title,
        exception: /An unhandled exception occurred|DeveloperExceptionPage|Unhandled exception|Error\.<\/h1>/i.test(html),
        leaks, brokenImages, fallbacks, links,
      };
    });
    // Liên kết dẫn tới trang lỗi (kể cả trang 404 đẹp) đều là liên kết hỏng.
    if (status >= 400) issues.push(`[http ${status}] ${current}`);
    if (info.exception) issues.push(`[exception] ${current}`);
    if (!info.title || !info.title.trim()) issues.push(`[title] ${current} không có <title>`);
    if (info.leaks.length) issues.push(`[razor] ${current} lộ chữ ${info.leaks.join(', ')}`);
    if (info.brokenImages.length) {
      // Sự kiện lỗi ảnh chạy sau một nhịp: đợi rồi đo lại, ảnh nào trang đã tự thay ô giữ chỗ thì thôi.
      await page.waitForTimeout(500);
      const still = await page.evaluate(srcs => [...document.images].filter(i => srcs.includes(i.getAttribute('src')) && !i.dataset.fallback && !i.classList.contains('img-failed') && i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')), info.brokenImages);
      if (still.length) issues.push(`[img] ${current} ảnh hỏng ${still.join(', ')}`);
      else for (const src of info.brokenImages) notes.add(`ảnh CDN không tải được (đã hiện ô giữ chỗ): ${src.slice(0, 90)}`);
    }
    for (const f of info.fallbacks) notes.add(`ảnh CDN không tải được (đã hiện ô giữ chỗ): ${f}`);

    await page.setViewportSize({ width: 390, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) issues.push(`[mobile] ${current} tràn ngang ${overflow}px ở 390px`);
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const link of info.links) {
      if (!link.startsWith(BASE)) continue;
      const clean = link.split('#')[0];
      const path = clean.replace(BASE, '');
      if (SKIP.some(r => r.test(path))) continue;
      // Khách và thành viên chỉ đi cửa hàng online; nhân viên chỉ đi khu quản lý (và trang chủ).
      if ((role === 'guest' || role === 'member') && /^\/Admin/i.test(path)) continue;
      if (STAFF[role] && !/^\/Admin/i.test(path)) continue;
      if (!seen.has(clean)) { seen.add(clean); queue.push(clean); }
    }
  }
  await context.close();
  return { role, visited, patterns: perPattern.size, issues, notes: [...notes] };
}

(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const role of ROLES) {
    const r = await crawl(browser, role);
    total += r.issues.length;
    console.log(`\n== ${role}: ${r.visited} trang, ${r.patterns} dạng đường dẫn, ${r.issues.length} vấn đề`);
    for (const i of [...new Set(r.issues)].slice(0, 80)) console.log('  ' + i);
    for (const n of r.notes.slice(0, 10)) console.log('  (ghi chú) ' + n);
  }
  await browser.close();
  console.log(`\nTổng: ${total} vấn đề`);
  process.exit(total ? 1 : 0);
})();
