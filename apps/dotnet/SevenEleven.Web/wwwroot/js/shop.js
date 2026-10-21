// Cửa hàng online: phần JavaScript làm mượt trải nghiệm. Mọi form vẫn gửi được khi tắt JavaScript
// (máy chủ kiểm tra lại tất cả); ở đây chỉ thêm toast, đồng hồ đếm ngược, hộp thoại, thêm vào giỏ
// không tải lại trang, ô OTP, sao chép mã... giống cảm giác bản Next.js.
(function () {
  "use strict";

  var doc = document;
  var meta = doc.querySelector('meta[name="rvt"]');
  var TOKEN = meta ? meta.getAttribute("content") : "";

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function on(el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clock(t) { t = Math.max(0, t); return pad(Math.floor(t / 3600)) + ":" + pad(Math.floor((t % 3600) / 60)) + ":" + pad(t % 60); }
  function vnd(n) {
    n = Math.round(n);
    return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₫";
  }
  function duration(minutes) {
    minutes = Math.max(1, minutes);
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return [h ? h + " giờ" : "", m ? m + " phút" : ""].filter(Boolean).join(" ");
  }
  function svg(paths, size, cls) {
    return '<svg class="ic' + (cls ? " " + cls : "") + '" width="' + (size || 16) + '" height="' + (size || 16) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  var P = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    success: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    error: '<path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    sms: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'
  };

  // ------------------------------------------------------------------ toast

  function toastHtml(t) {
    var tone = t.tone || "success";
    var html = '<span class="toast-icon">' + svg(P[tone] || P.info, 16) + '</span><div class="toast-body"><p class="toast-title">' + esc(t.title) + "</p>";
    if (t.descHtml) html += '<p class="toast-desc">' + t.descHtml + "</p>";
    else if (t.desc) html += '<p class="toast-desc">' + esc(t.desc) + "</p>";
    if (t.action) {
      html += '<div class="toast-act">';
      if (t.action.post) {
        html += '<form method="post" action="' + esc(t.action.href) + '" data-keep-scroll><input type="hidden" name="__RequestVerificationToken" value="' + esc(TOKEN) + '">';
        Object.keys(t.action.post).forEach(function (k) { html += '<input type="hidden" name="' + esc(k) + '" value="' + esc(t.action.post[k]) + '">'; });
        html += '<button type="submit">' + esc(t.action.label) + "</button></form>";
      } else html += '<a href="' + esc(t.action.href) + '">' + esc(t.action.label) + "</a>";
      html += "</div>";
    }
    return html + '</div><button type="button" class="toast-x" aria-label="Đóng thông báo">' + svg(P.x, 14) + "</button>";
  }

  function dismiss(el) {
    if (!el || el.hidden) return;
    el.classList.add("leaving");
    setTimeout(function () { el.hidden = true; el.classList.remove("leaving"); }, 200);
  }

  function wireToast(el) {
    if (el.getAttribute("data-wired")) return;
    el.setAttribute("data-wired", "1");
    on($(".toast-x", el), "click", function () { dismiss(el); });
    var ms = parseInt(el.getAttribute("data-duration") || (el.classList.contains("toast-error") ? "6000" : "4000"), 10);
    var timer = setTimeout(function () { dismiss(el); }, ms);
    on(el, "mouseenter", function () { clearTimeout(timer); });
    on(el, "mouseleave", function () { clearTimeout(timer); timer = setTimeout(function () { dismiss(el); }, 2500); });
  }

  function toast(t) {
    var box = $("#toasts");
    if (!box || !t) return null;
    if (t.id) $$('[data-toast-id="' + t.id + '"]', box).forEach(function (old) { old.remove(); });
    var el = doc.createElement("div");
    var tone = t.tone || "success";
    el.className = "toast toast-" + tone + (tone === "success" ? " alert-ok" : tone === "error" ? " alert-error" : "");
    el.setAttribute("role", tone === "error" ? "alert" : "status");
    if (t.duration) el.setAttribute("data-duration", t.duration);
    if (t.id) el.setAttribute("data-toast-id", t.id);
    el.innerHTML = toastHtml(t);
    box.appendChild(el);
    wireToast(el);
    var shown = $$(".toast:not([hidden])", box);
    if (shown.length > 3) dismiss(shown[0]);
    return el;
  }
  window.ShopToast = toast;
  $$("#toasts .toast").forEach(wireToast);
  // Toast của thao tác ngay trước lần tải lại trang (ví dụ thêm món ở giỏ hàng).
  try {
    var pending = sessionStorage.getItem("shop-toast");
    if (pending) { sessionStorage.removeItem("shop-toast"); toast(JSON.parse(pending)); }
  } catch (err) { /* bỏ qua */ }

  // ------------------------------------------------------------------ đồng hồ đếm ngược

  var started = Date.now();
  function tick() {
    var elapsed = Math.floor((Date.now() - started) / 1000);
    $$("[data-left]").forEach(function (el) {
      var left = parseInt(el.getAttribute("data-left"), 10) - elapsed;
      if (left <= 0) {
        left = 0;
        if (!el.getAttribute("data-ended")) {
          el.setAttribute("data-ended", "1");
          if (el.hasAttribute("data-reload")) setTimeout(function () { location.reload(); }, 1500);
          if (el.hasAttribute("data-hide-on-end")) el.hidden = true;
        }
      }
      var digits = $$("[data-digit]", el);
      if (digits.length === 3) {
        digits[0].textContent = pad(Math.floor(left / 3600));
        digits[1].textContent = pad(Math.floor((left % 3600) / 60));
        digits[2].textContent = pad(left % 60);
      } else if (el.hasAttribute("data-duration-text")) {
        ($("[data-clock]", el) || el).textContent = duration(Math.ceil(left / 60));
      } else if (el.hasAttribute("data-seconds-text")) {
        ($("[data-clock]", el) || el).textContent = left + " giây";
        if (left === 0) {
          var swap = el.getAttribute("data-swap");
          if (swap) { el.hidden = true; var target = doc.getElementById(swap); if (target) target.hidden = false; }
        }
      } else {
        ($("[data-clock]", el) || el).textContent = clock(left);
      }
    });
  }
  if ($("[data-left]")) { tick(); setInterval(tick, 1000); }

  // ------------------------------------------------------------------ hộp thoại

  function openDialog(d) {
    if (!d) return;
    // Menu điện thoại dùng lại danh mục của thanh bên (chép khi mở lần đầu, đổi id cho khỏi trùng).
    var slot = $("[data-nav-clone]", d);
    var source = $(".side .cnav");
    if (slot && !slot.firstChild && source) {
      var copy = source.cloneNode(true);
      $$("[id]", copy).forEach(function (el) { el.id = "sheet-" + el.id; });
      $$("[aria-controls]", copy).forEach(function (el) { el.setAttribute("aria-controls", "sheet-" + el.getAttribute("aria-controls")); });
      slot.appendChild(copy);
    }
    if (d.open) d.close();
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    doc.body.classList.add("dialog-open");
  }
  window.ShopOpenDialog = openDialog;

  doc.addEventListener("click", function (e) {
    var opener = e.target.closest("[data-dialog-open]");
    if (opener) {
      e.preventDefault();
      openDialog(doc.getElementById(opener.getAttribute("data-dialog-open")));
      return;
    }
    var closer = e.target.closest("[data-close]");
    if (closer) {
      var d = closer.closest("dialog");
      if (d) { e.preventDefault(); d.close(); }
      return;
    }
    if (e.target.tagName === "DIALOG" && e.target.open) {
      var r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
    }
  });
  $$("dialog").forEach(function (d) { on(d, "close", function () { doc.body.classList.remove("dialog-open"); }); });
  $$('dialog[data-open-on-load="true"]').forEach(function (d) { openDialog(d); });

  // Menu xổ xuống dạng <details>: bấm ra ngoài hoặc Esc thì đóng.
  doc.addEventListener("click", function (e) {
    $$("details[data-dropdown][open]").forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute("open"); });
  });
  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape") $$("details[data-dropdown][open]").forEach(function (d) { d.removeAttribute("open"); });
  });

  // Danh mục bên trái: mỗi lần mở một ngành hàng.
  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-cnav-toggle]");
    if (!btn) return;
    var list = doc.getElementById(btn.getAttribute("aria-controls"));
    var open = btn.getAttribute("aria-expanded") !== "true";
    var nav = btn.closest(".cnav");
    if (open && nav) $$('[data-cnav-toggle][aria-expanded="true"]', nav).forEach(function (other) {
      if (other === btn) return;
      other.setAttribute("aria-expanded", "false");
      var l = doc.getElementById(other.getAttribute("aria-controls"));
      if (l) l.hidden = true;
    });
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", (open ? "Thu gọn " : "Mở ") + btn.getAttribute("data-name"));
    if (list) list.hidden = !open;
  });

  // Ô tìm kiếm rỗng thì không gửi.
  $$("form.hdr-search").forEach(function (f) {
    on(f, "submit", function (e) { var q = f.querySelector("input[name=q]"); if (q && !q.value.trim()) e.preventDefault(); });
  });

  // ------------------------------------------------------------------ ảnh hỏng

  function markFailed(img) {
    if (img.classList.contains("img-failed")) return;
    img.classList.add("img-failed");
    if (img.parentElement) img.parentElement.classList.add("img-fallback");
  }
  doc.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "IMG") markFailed(t); }, true);
  $$("img").forEach(function (img) { if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) markFailed(img); });

  // ------------------------------------------------------------------ giữ vị trí cuộn sau khi gửi form

  var SCROLL_KEY = "shop-scroll";
  function saveScroll() {
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ p: location.pathname, y: window.scrollY })); } catch (err) { /* không có sessionStorage */ }
  }
  // Liên kết "Xem thêm" (tải thêm đơn, thêm lịch sử sao) giữ nguyên chỗ đang xem.
  doc.addEventListener("click", function (e) { if (e.target.closest("a[data-keep-scroll-link]")) saveScroll(); });
  try {
    var saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "null");
    sessionStorage.removeItem(SCROLL_KEY);
    if (saved && saved.p === location.pathname && !location.hash) window.scrollTo(0, saved.y);
  } catch (err) { /* bỏ qua */ }

  // ------------------------------------------------------------------ giỏ hàng: số trên biểu tượng, nút "+"

  function setCartCount(n) {
    $$("[data-cart-count]").forEach(function (el) {
      el.textContent = n > 99 ? "99+" : String(n);
      el.hidden = n <= 0;
    });
    $$("[data-cart-link]").forEach(function (a) { a.setAttribute("aria-label", "Giỏ hàng" + (n > 0 ? ", " + n + " sản phẩm" : "")); });
  }

  function qaHtml(qa, qty) {
    var id = qa.getAttribute("data-qa");
    var ret = qa.getAttribute("data-return") || location.pathname + location.search;
    var common = '<input type="hidden" name="__RequestVerificationToken" value="' + esc(TOKEN) + '"><input type="hidden" name="productId" value="' + esc(id) +
      '"><input type="hidden" name="returnUrl" value="' + esc(ret) + '">';
    if (qty <= 0) {
      return '<form method="post" action="/Cart/Add" data-ajax data-age-gate="' + esc(qa.getAttribute("data-age") || "false") + '">' + common +
        '<input type="hidden" name="ageConfirmed" value="false"><button type="submit" class="qa-plus" aria-label="Thêm ' + esc(qa.getAttribute("data-name")) +
        ' vào giỏ">' + svg(P.plus, 20, "", 2.5) + "</button></form>";
    }
    return '<div class="qa-step"><form method="post" action="/Cart/Step" data-ajax>' + common + '<input type="hidden" name="delta" value="-1"><button type="submit" aria-label="Bớt 1">' +
      svg(P.minus, 16) + '</button></form><span class="qa-n">' + qty + '</span><form method="post" action="/Cart/Step" data-ajax>' + common +
      '<input type="hidden" name="delta" value="1"><button type="submit" class="qa-inc" aria-label="Thêm 1">' + svg(P.plus, 16) + "</button></form></div>";
  }

  function renderQuickAdd(productId, qty) {
    $$('.qa[data-qa="' + productId + '"]').forEach(function (qa) { qa.innerHTML = qaHtml(qa, qty); });
  }

  // ------------------------------------------------------------------ gửi form bằng fetch

  var ageOk = doc.body.getAttribute("data-age-ok") === "true";
  var pendingAge = null;

  function handleJson(data, form) {
    if (!data) return;
    // Phiên trên máy chủ chưa ghi nhận xác nhận 18+ (ví dụ phiên hết hạn): hỏi lại.
    if (data.needsAge) {
      ageOk = false;
      doc.body.setAttribute("data-age-ok", "false");
      askAge(form, null);
      return;
    }
    if (data.toast) toast(data.toast);
    if (typeof data.cartCount === "number") setCartCount(data.cartCount);
    if (data.productId) renderQuickAdd(data.productId, data.quantity || 0);
    if (data.ageConfirmed) { ageOk = true; doc.body.setAttribute("data-age-ok", "true"); }
    form.dispatchEvent(new CustomEvent("shop:done", { detail: data, bubbles: true }));
    if (data.redirect) {
      if (data.message) {
        var holder = $("[data-placing]");
        if (holder) { holder.innerHTML = '<div class="placing"><span class="spinner" aria-hidden="true"></span><p>' + esc(data.message) + "</p></div>"; window.scrollTo(0, 0); }
      }
      location.href = data.redirect;
      return;
    }
    if (data.reload) { saveScroll(); location.reload(); return; }
    // Trang giỏ hàng: thêm món từ dải gợi ý thì tải lại để danh sách và tổng tiền khớp.
    if (data.ok && form.closest("[data-refresh-page]")) {
      try { if (data.toast) sessionStorage.setItem("shop-toast", JSON.stringify(data.toast)); } catch (err) { /* bỏ qua */ }
      saveScroll();
      location.reload();
    }
  }

  function ajaxSubmit(form, submitter) {
    var fd = new FormData(form);
    if (submitter && submitter.name) fd.append(submitter.name, submitter.value);
    var box = form.closest(".qa") || form;
    box.classList.add("busy");
    if (submitter) submitter.disabled = true;
    fetch(form.action, { method: "POST", body: fd, headers: { "X-Requested-With": "fetch", "Accept": "application/json" }, credentials: "same-origin" })
      .then(function (res) {
        var type = res.headers.get("content-type") || "";
        if (type.indexOf("application/json") < 0) throw new Error("not-json");
        return res.json();
      })
      .then(function (data) {
        box.classList.remove("busy");
        if (submitter) submitter.disabled = false;
        handleJson(data, form);
      })
      .catch(function () {
        // Máy chủ trả trang HTML (ví dụ phiên hết hạn): gửi form theo cách thường.
        box.classList.remove("busy");
        form.removeAttribute("data-ajax");
        HTMLFormElement.prototype.submit.call(form);
      });
  }

  function resubmit(form, submitter) {
    if (typeof form.requestSubmit === "function") {
      if (submitter && submitter.form === form) form.requestSubmit(submitter); else form.requestSubmit();
    } else form.submit();
  }

  // Hộp thoại xác nhận đẹp (Xoá giỏ hàng...): form có data-dialog-confirm.
  var pendingConfirm = null;
  function askConfirm(form, submitter) {
    var d = $("#confirm-dialog");
    if (!d) { form.setAttribute("data-confirmed", "1"); resubmit(form, submitter); return; }
    pendingConfirm = { form: form, submitter: submitter };
    $(".modal-title", d).textContent = form.getAttribute("data-dialog-title") || "Xác nhận";
    $(".modal-desc", d).textContent = form.getAttribute("data-dialog-desc") || "";
    $("[data-confirm-cancel]", d).textContent = form.getAttribute("data-dialog-cancel") || "Huỷ";
    var ok = $("[data-confirm-ok]", d);
    ok.textContent = form.getAttribute("data-dialog-ok") || "Đồng ý";
    ok.className = "btn " + (form.getAttribute("data-dialog-tone") === "danger" ? "btn-danger-solid" : "");
    openDialog(d);
  }
  on($("[data-confirm-ok]"), "click", function () {
    var d = $("#confirm-dialog");
    if (d) d.close();
    if (!pendingConfirm) return;
    var p = pendingConfirm;
    pendingConfirm = null;
    p.form.setAttribute("data-confirmed", "1");
    resubmit(p.form, p.submitter);
  });

  function askAge(form, submitter) {
    pendingAge = { form: form, submitter: submitter };
    openDialog($("#age-gate"));
  }
  on($("#age-ok"), "click", function (e) {
    e.preventDefault();
    ageOk = true;
    doc.body.setAttribute("data-age-ok", "true");
    var d = $("#age-gate");
    if (d) d.close();
    if (!pendingAge) return;
    var p = pendingAge;
    pendingAge = null;
    var flags = $$('input[name="ageConfirmed"]', p.form);
    if (!flags.length) {
      var flag = doc.createElement("input");
      flag.type = "hidden";
      flag.name = "ageConfirmed";
      p.form.appendChild(flag);
      flags = [flag];
    }
    flags.forEach(function (i) { i.value = "true"; });
    resubmit(p.form, p.submitter);
  });

  doc.addEventListener("submit", function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    // 1. Xác nhận kiểu cũ của trình duyệt (huỷ đơn, xoá địa chỉ, đổi sao).
    var q = form.getAttribute("data-confirm");
    if (q && !window.confirm(q)) { e.preventDefault(); return; }
    // 2. Hộp thoại xác nhận.
    if (form.hasAttribute("data-dialog-confirm")) {
      if (!form.getAttribute("data-confirmed")) { e.preventDefault(); askConfirm(form, e.submitter); return; }
      form.removeAttribute("data-confirmed");
    }
    // 3. Hàng giới hạn độ tuổi: hỏi một lần mỗi phiên.
    if (form.getAttribute("data-age-gate") === "true" && !ageOk) { e.preventDefault(); askAge(form, e.submitter); return; }
    if (form.getAttribute("data-age-gate") === "true") $$('input[name="ageConfirmed"]', form).forEach(function (i) { i.value = "true"; });
    // 4. Gửi bằng fetch hoặc gửi thường (giữ vị trí cuộn).
    if (form.hasAttribute("data-ajax")) { e.preventDefault(); ajaxSubmit(form, e.submitter); return; }
    if (form.hasAttribute("data-keep-scroll")) saveScroll();
    var busy = form.getAttribute("data-busy-text");
    if (busy && e.submitter) {
      var b = e.submitter;
      setTimeout(function () { b.disabled = true; b.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + esc(busy); }, 0);
    }
  });

  $$("select[data-autosubmit]").forEach(function (s) {
    on(s, "change", function () { if (s.form) resubmit(s.form); });
  });

  // ------------------------------------------------------------------ dải trượt ngang

  function wireRail(rail) {
    var track = $("[data-rail-track]", rail);
    var prev = $("[data-rail-prev]", rail);
    var next = $("[data-rail-next]", rail);
    if (!track || rail.getAttribute("data-wired")) return;
    rail.setAttribute("data-wired", "1");
    function update() {
      var s = track.scrollLeft;
      if (prev) prev.classList.toggle("show", s > 4);
      if (next) next.classList.toggle("show", s + track.clientWidth < track.scrollWidth - 4);
    }
    rail.__update = update;
    on(prev, "click", function () { track.scrollBy({ left: -track.clientWidth * 0.85, behavior: "smooth" }); });
    on(next, "click", function () { track.scrollBy({ left: track.clientWidth * 0.85, behavior: "smooth" }); });
    on(track, "scroll", update, { passive: true });
    on(window, "resize", update);
    update();
    $$("img", track).forEach(function (img) { if (!img.complete) on(img, "load", update); });
  }
  $$("[data-rail]").forEach(wireRail);
  function refreshRails(root) { $$("[data-rail]", root).forEach(function (r) { if (r.__update) r.__update(); }); }

  // ------------------------------------------------------------------ chuyển tab/chip không tải lại trang

  doc.addEventListener("click", function (e) {
    var sw = e.target.closest("[data-switch]");
    if (!sw) return;
    var parts = sw.getAttribute("data-switch").split(":");
    var group = parts[0], key = parts[1];
    e.preventDefault();
    $$('[data-switch^="' + group + ':"]').forEach(function (b) {
      var active = b.getAttribute("data-switch") === group + ":" + key;
      b.classList.toggle("active", active);
      if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", active ? "true" : "false");
      if (b.hasAttribute("aria-selected")) b.setAttribute("aria-selected", active ? "true" : "false");
    });
    $$('[data-panel^="' + group + ':"]').forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== group + ":" + key;
      if (!p.hidden) refreshRails(p);
    });
    var param = sw.getAttribute("data-param");
    if (param && history.replaceState) {
      var url = new URL(location.href);
      url.searchParams.set(param, key);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  });

  // ------------------------------------------------------------------ sao chép mã

  function copyFallback(text) {
    try {
      var area = doc.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      doc.body.appendChild(area);
      area.select();
      var ok = doc.execCommand("copy");
      area.remove();
      return ok;
    } catch (err) { return false; }
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return copyFallback(text); });
    }
    return Promise.resolve(copyFallback(text));
  }
  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy]");
    if (!btn) return;
    e.preventDefault();
    var code = btn.getAttribute("data-copy");
    copyText(code).then(function (ok) {
      if (ok) {
        toast({ title: "Đã sao chép mã " + code, desc: btn.getAttribute("data-copy-desc") || null });
        var icon = $(".copy-ic", btn);
        if (icon) {
          var old = icon.innerHTML;
          icon.innerHTML = svg(P.check, 16, "text-fresh");
          setTimeout(function () { icon.innerHTML = old; }, 2000);
        }
      } else toast({ title: "Không sao chép được, bạn ghi lại mã " + code + " nhé", tone: "error" });
    });
  });

  // ------------------------------------------------------------------ mật khẩu: hiện / ẩn

  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-pw-toggle]");
    if (!btn) return;
    var input = btn.parentElement && $("input", btn.parentElement);
    if (!input) return;
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
  });

  // ------------------------------------------------------------------ ô OTP 6 số

  $$("[data-otp]").forEach(function (form) {
    var boxes = $$("input[data-otp-box]", form);
    var submitBtn = $("[data-otp-submit]", form);
    var sent = false;
    function value() { return boxes.map(function (b) { return b.value; }).join(""); }
    function sync() {
      var full = value().length === boxes.length;
      if (submitBtn) submitBtn.disabled = !full || form.getAttribute("data-blocked") === "true";
      if (full && !sent && form.getAttribute("data-blocked") !== "true") { sent = true; setTimeout(function () { resubmit(form, submitBtn); }, 80); }
    }
    function spread(from, digits) {
      for (var i = 0; i < digits.length && from + i < boxes.length; i++) boxes[from + i].value = digits[i];
      var next = Math.min(from + digits.length, boxes.length - 1);
      boxes[next].focus();
      boxes[next].select();
    }
    boxes.forEach(function (box, i) {
      on(box, "input", function () {
        var digits = box.value.replace(/\D/g, "");
        box.value = "";
        if (digits.length) spread(i, digits.split(""));
        sync();
      });
      on(box, "keydown", function (e) {
        if (e.key === "Backspace" && !box.value && i > 0) { boxes[i - 1].value = ""; boxes[i - 1].focus(); e.preventDefault(); sync(); }
        else if (e.key === "ArrowLeft" && i > 0) { boxes[i - 1].focus(); e.preventDefault(); }
        else if (e.key === "ArrowRight" && i < boxes.length - 1) { boxes[i + 1].focus(); e.preventDefault(); }
      });
      on(box, "paste", function (e) {
        var text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "");
        if (!text) return;
        e.preventDefault();
        spread(i, text.split(""));
        sync();
      });
      on(box, "focus", function () { box.select(); });
    });
    on(form, "submit", function () {
      boxes.forEach(function (b) { b.readOnly = true; });
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Đang xác thực…';
      }
    });
    sync();
    var first = boxes.filter(function (b) { return !b.value; })[0];
    if (first && form.getAttribute("data-blocked") !== "true") first.focus();
  });

  // Tin nhắn SMS giả lập: xem lại mã.
  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-sms]");
    if (!btn) return;
    e.preventDefault();
    toast({
      id: "demo-sms", tone: "sms", duration: 30000,
      title: "SMS giả lập tới " + btn.getAttribute("data-phone"),
      descHtml: "7-Eleven: Mã xác minh của bạn là <b class=\"sms-code\">" + esc(btn.getAttribute("data-sms")) + "</b>, hiệu lực 5 phút. Không chia sẻ mã này cho bất kỳ ai."
    });
  });

  // ------------------------------------------------------------------ form hồ sơ: chỉ lưu khi có thay đổi

  $$("form[data-dirty-form]").forEach(function (form) {
    var fields = $$("input:not([type=hidden]):not([disabled]), select, textarea", form);
    var initial = fields.map(function (f) { return f.value; });
    var buttons = $$("[data-dirty-enable]", form);
    function check() {
      var dirty = fields.some(function (f, i) { return f.value !== initial[i]; });
      buttons.forEach(function (b) { b.disabled = !dirty; });
    }
    fields.forEach(function (f) { on(f, "input", check); on(f, "change", check); });
    on(form, "reset", function () { setTimeout(function () { $$(".field-error", form).forEach(function (el) { el.remove(); }); check(); }, 0); });
    if (form.getAttribute("data-has-errors") !== "true") check();
  });

  // ------------------------------------------------------------------ giỏ hàng

  // Ghi chú, người nhận, cách thanh toán được lưu vào phiên để không mất khi trang tải lại.
  var draftTimer = null;
  function saveDraft(form) {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      var fd = new FormData();
      fd.append("__RequestVerificationToken", TOKEN);
      // Ô nhập nằm ngoài thẻ form (gắn bằng thuộc tính form="checkout"), nên tìm trên cả trang.
      $$("[data-draft]").forEach(function (f) {
        if ((f.type === "radio" || f.type === "checkbox") && !f.checked) return;
        fd.append(f.getAttribute("data-draft"), f.value);
      });
      fetch("/Cart/Draft", { method: "POST", body: fd, headers: { "X-Requested-With": "fetch" }, credentials: "same-origin" }).catch(function () { /* bỏ qua */ });
    }, 400);
  }
  $$("form[data-draft-form]").forEach(function (form) {
    $$("[data-draft]", doc).forEach(function (f) {
      on(f, "input", function () { saveDraft(form); });
      on(f, "change", function () { saveDraft(form); });
    });
  });
  $$("[data-count-for]").forEach(function (counter) {
    var input = doc.getElementById(counter.getAttribute("data-count-for"));
    if (!input) return;
    var max = parseInt(input.getAttribute("maxlength") || "200", 10);
    function upd() { counter.textContent = input.value.length + "/" + max; }
    on(input, "input", upd);
    upd();
  });

  // Ô chọn voucher: chân hộp thoại hiện voucher đang chọn.
  $$("[data-voucher-form]").forEach(function (form) {
    var label = $("[data-voucher-chosen]", form.closest("dialog") || doc);
    var useBtn = $("[data-voucher-use]", form);
    function upd() {
      var picked = $("input[name=code]:checked", form);
      if (useBtn) useBtn.disabled = !picked;
      if (!label) return;
      if (picked) {
        label.innerHTML = '<p class="trunc">Đã chọn <b>' + esc(picked.value) + '</b></p><p class="vp-save">Giảm ' + esc(vnd(parseInt(picked.getAttribute("data-saving") || "0", 10))) + "</p>";
      } else label.innerHTML = '<p class="muted">Chưa chọn voucher</p>';
    }
    $$("input[name=code]", form).forEach(function (r) { on(r, "change", upd); });
    upd();
  });
  $$("input[data-upper]").forEach(function (i) { on(i, "input", function () { var p = i.selectionStart; i.value = i.value.toUpperCase(); try { i.setSelectionRange(p, p); } catch (err) { /* bỏ qua */ } }); });

  // ------------------------------------------------------------------ đăng nhập: điền tài khoản demo

  doc.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-demo-phone]");
    if (!btn) return;
    var phone = $("#signin-phone"), pass = $("#signin-password");
    if (phone) phone.value = btn.getAttribute("data-demo-phone");
    if (pass) pass.value = btn.getAttribute("data-demo-password");
    btn.classList.add("selected");
    $$(".field-error", btn.closest(".auth-card") || doc).forEach(function (el) { el.remove(); });
    var submit = $(".auth-form button[type=submit]");
    if (submit) submit.focus();
  });

  // ------------------------------------------------------------------ trang sản phẩm: số lượng và tổng tiền

  $$("[data-buy]").forEach(function (box) {
    var unit = parseInt(box.getAttribute("data-unit"), 10) || 0;
    var buy = parseInt(box.getAttribute("data-buy-x") || "0", 10);
    var get = parseInt(box.getAttribute("data-get-y") || "0", 10);
    var max = parseInt(box.getAttribute("data-max") || "99", 10);
    var unitName = box.getAttribute("data-unit-name") || "";
    var bundleLabel = box.getAttribute("data-bundle") || "";
    var qty = parseInt(box.getAttribute("data-qty") || "1", 10);
    function total(q) {
      var free = buy > 0 && get > 0 ? Math.floor(q / (buy + get)) * get : 0;
      return { sum: unit * q - free * unit, free: free };
    }
    function render() {
      $$("[data-qty-value]").forEach(function (el) { el.textContent = qty; });
      $$("input[name=quantity][data-qty-input]").forEach(function (el) { el.value = qty; });
      $$("[data-qty-dec]").forEach(function (b) { b.disabled = qty <= 1; });
      $$("[data-qty-inc]").forEach(function (b) { b.disabled = qty >= max; });
      var t = total(qty);
      $$("[data-total]").forEach(function (el) { el.textContent = vnd(t.sum); });
      var hint = $("[data-bundle-hint]");
      if (hint) {
        hint.hidden = !(t.free > 0 && bundleLabel);
        hint.textContent = "Giá trên đã trừ quà tặng “" + bundleLabel + "” cho " + qty + " " + unitName + ".";
      }
    }
    doc.addEventListener("click", function (e) {
      if (e.target.closest("[data-qty-dec]")) { qty = Math.max(1, qty - 1); render(); }
      else if (e.target.closest("[data-qty-inc]")) { qty = Math.min(max, qty + 1); render(); }
    });
    $$("input[data-qty-input]").forEach(function (input) {
      on(input, "change", function () {
        var v = parseInt(input.value, 10);
        qty = isNaN(v) ? 1 : Math.min(max, Math.max(1, v));
        render();
      });
    });
    render();
  });
})();
