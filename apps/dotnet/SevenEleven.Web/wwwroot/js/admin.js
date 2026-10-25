// Khu quản lý: vài tiện ích nhỏ. Không có JavaScript trang vẫn chạy đủ (form gửi rồi tải lại),
// có JavaScript thì mượt hơn: hoá đơn ở quầy cập nhật tại chỗ, bảng đơn tự làm mới.
(function () {
  "use strict";

  // Form có data-fetch="#vùng": gửi bằng fetch rồi thay vùng đó bằng HTML máy chủ trả về,
  // giữ nguyên chỗ cuộn của danh sách sản phẩm khi thu ngân bấm thêm hàng.
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    // Hỏi lại trước thao tác khó hoàn tác; câu hỏi nằm trong data-confirm nên tên có dấu nháy không làm hỏng JS.
    if (form.hasAttribute("data-confirm") && !window.confirm(form.getAttribute("data-confirm"))) {
      event.preventDefault();
      return;
    }
    if (!form.hasAttribute("data-fetch")) return;
    var target = document.querySelector(form.getAttribute("data-fetch"));
    if (!target) return;
    event.preventDefault();
    var data = new FormData(form);
    if (event.submitter && event.submitter.name) data.append(event.submitter.name, event.submitter.value);
    target.setAttribute("aria-busy", "true");
    fetch(form.action, { method: "POST", body: data, headers: { "X-Requested-With": "fetch" } })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.text();
      })
      .then(function (html) {
        target.outerHTML = html;
        var refreshed = document.querySelector(form.getAttribute("data-fetch"));
        if (refreshed) initPayment(refreshed);
        var focus = document.querySelector("[data-refocus]");
        if (focus) focus.focus();
      })
      .catch(function () {
        form.removeAttribute("data-fetch");
        form.submit();
      });
  });

  var vnd = function (n) { return n.toLocaleString("vi-VN") + " ₫"; };
  var digits = function (v) { var n = parseInt(String(v || "").replace(/\D/g, ""), 10); return isNaN(n) ? null : n; };

  // Hộp thanh toán ở quầy: chọn hình thức, gợi ý mệnh giá, tính tiền thừa, chặn khi thiếu tiền hoặc chưa kiểm tuổi.
  function initPayment(root) {
    var box = root.querySelector ? root.querySelector("[data-payment]") : null;
    if (!box) return;
    var total = parseInt(box.getAttribute("data-total"), 10) || 0;
    var cash = box.querySelector("[data-cash]");
    var change = box.querySelector("[data-change]");
    var changeLabel = box.querySelector("[data-change-label]");
    var changeBox = box.querySelector("[data-change-box]");
    var submit = box.querySelector("[data-pay]");
    var label = box.querySelector("[data-pay-label]");
    var age = box.querySelector("[data-age]");
    var error = box.querySelector("[data-pay-error]");
    var blocked = box.getAttribute("data-blocked") === "true";

    function method() { var m = box.querySelector("input[name=paymentMethod]:checked"); return m ? m.value : "Cash"; }
    function update() {
      var m = method();
      box.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== m; });
      label.textContent = submit.getAttribute(m === "Cash" ? "data-label-cash" : m === "Card" ? "data-label-card" : "data-label-qr");
      var received = digits(cash.value);
      var diff = received === null ? null : received - total;
      changeLabel.textContent = diff !== null && diff < 0 ? "Khách còn thiếu" : "Tiền thừa trả khách";
      change.textContent = diff === null ? "—" : vnd(Math.abs(diff));
      changeBox.classList.toggle("short", diff !== null && diff < 0);
      submit.disabled = blocked || total <= 0;
      error.hidden = true;
    }
    function problem() {
      if (method() === "Cash") { var r = digits(cash.value); if (r === null || r < total) return "Tiền khách đưa chưa đủ"; }
      if (age && !age.checked) return "Cần xác nhận đã kiểm tra tuổi của khách";
      return null;
    }
    box.addEventListener("submit", function (ev) {
      var p = problem();
      if (p) { ev.preventDefault(); error.textContent = p; error.hidden = false; if (method() === "Cash") cash.focus(); }
      else submit.disabled = true;
    });
    box.querySelectorAll("[data-quick]").forEach(function (b) {
      b.addEventListener("click", function () { cash.value = parseInt(b.getAttribute("data-quick"), 10).toLocaleString("vi-VN"); update(); cash.focus(); });
    });
    box.addEventListener("input", update);
    box.addEventListener("change", update);
    update();
  }

  // Hộp thoại <dialog>: nút data-open-dialog="id" mở, data-close-dialog đóng.
  document.addEventListener("click", function (ev) {
    var opener = ev.target.closest("[data-open-dialog]");
    if (opener && !opener.disabled) {
      var dialog = document.getElementById(opener.getAttribute("data-open-dialog"));
      if (dialog && dialog.showModal) {
        ev.preventDefault();
        var pop = opener.closest("details[open]");
        if (pop) pop.removeAttribute("open");
        dialog.showModal();
        var first = dialog.querySelector("[autofocus], [data-cash]");
        if (first) { first.focus(); if (first.select) first.select(); }
      }
      return;
    }
    var closer = ev.target.closest("[data-close-dialog]");
    if (closer) { var d = closer.closest("dialog"); if (d) d.close(); }
  });

  // Ô nhập tiền: gõ số tới đâu chấm phân cách tới đó.
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (!el.matches || !el.matches("[data-money]")) return;
    var n = digits(el.value);
    var formatted = n === null ? "" : n.toLocaleString("vi-VN");
    if (formatted !== el.value) { el.value = formatted; el.setSelectionRange(formatted.length, formatted.length); }
  });

  // Kết ca ở quầy: chênh lệch so với tiền dự kiến ngay khi gõ.
  document.querySelectorAll("[data-shift-out]").forEach(function (form) {
    var expected = parseInt(form.getAttribute("data-expected"), 10) || 0;
    var input = form.querySelector("input[name=closingCash]");
    var out = form.querySelector("[data-shift-diff]");
    function update() {
      var v = digits(input.value);
      var d = v === null ? 0 : v - expected;
      out.textContent = v === null || d === 0 ? "" : "· " + (d < 0 ? "thiếu " : "thừa ") + vnd(Math.abs(d));
      out.className = d < 0 ? "neg" : "warn-text";
    }
    input.addEventListener("input", update);
    update();
  });

  // Đồng hồ ở quầy.
  var clock = document.querySelector("[data-clock]");
  if (clock) {
    var tick = function () { var d = new Date(); clock.textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
    tick();
    setInterval(tick, 15000);
  }

  // Phím tắt ở quầy: F2 tìm/quét, F4 khách hàng, F9 thanh toán, Esc xoá ô tìm. Hoá đơn in: Enter = đơn mới.
  document.addEventListener("keydown", function (ev) {
    var search = document.querySelector("[data-pos-search]");
    var go = document.querySelector("[data-enter-go]");
    if (go && ev.key === "Enter" && !ev.target.closest("input, textarea, select, button, a")) { ev.preventDefault(); go.click(); return; }
    if (!search) return;
    if (document.querySelector("dialog[open]")) return;
    if (ev.key === "F2") { ev.preventDefault(); search.focus(); search.select(); }
    else if (ev.key === "F4") { ev.preventDefault(); var phone = document.querySelector("[data-pos-phone]"); if (phone) phone.focus(); }
    else if (ev.key === "F9") { ev.preventDefault(); var pay = document.querySelector("[data-pay-open]"); if (pay && !pay.disabled) pay.click(); }
    else if (ev.key === "Escape" && ev.target === search && search.value) { ev.preventDefault(); search.value = ""; }
  });

  initPayment(document);

  // Bảng đơn: tự tải lại để thấy đơn mới, trừ khi người dùng đang gõ dở.
  var refresh = document.querySelector("[data-autorefresh]");
  if (refresh) {
    var seconds = parseInt(refresh.getAttribute("data-autorefresh"), 10) || 30;
    setInterval(function () {
      var active = document.activeElement;
      var typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
      if (document.visibilityState === "visible" && !typing) location.reload();
    }, seconds * 1000);
  }

  // ---------------------------------------------------------------- form sản phẩm
  var money = function (n) { return Math.round(n).toLocaleString("vi-VN") + " ₫"; };
  var num = function (el) { var v = parseInt(((el && el.value) || "").replace(/\D/g, ""), 10); return isNaN(v) ? null : v; };

  document.querySelectorAll("[data-product-form]").forEach(function (form) {
    var cat = form.querySelector("[data-category-select]");
    var sub = form.querySelector("[data-subcategory-select]");
    var age = form.querySelector("[data-age-box]");
    function filterSubs(autoPick) {
      var options = Array.prototype.slice.call(sub.options).filter(function (o) { return o.value; });
      var visible = options.filter(function (o) { var show = o.getAttribute("data-category") === cat.value; o.hidden = !show; o.disabled = !show; return show; });
      if (sub.selectedOptions[0] && sub.selectedOptions[0].hidden) sub.value = "";
      if (autoPick && visible.length === 1) sub.value = visible[0].value;
      sub.options[0].textContent = cat.value ? "Chọn nhóm hàng" : "Chọn danh mục trước";
      sub.disabled = !cat.value;
    }
    if (cat && sub) {
      filterSubs(false);
      cat.addEventListener("change", function () {
        filterSubs(true);
        var picked = cat.selectedOptions[0];
        if (age && picked && picked.getAttribute("data-age") === "1") age.checked = true;
      });
    }
    var price = form.querySelector("[data-price]");
    var cost = form.querySelector("[data-cost]");
    var compare = form.querySelector("[data-compare]");
    var margin = form.querySelector("[data-margin]");
    var unit = form.querySelector("[name=Unit]");
    function updateMargin() {
      var p = num(price), c = num(cost), o = num(compare);
      if (!p || c === null) { margin.textContent = "Nhập giá bán và giá vốn để xem lãi gộp."; margin.className = "flash flash-warn"; return; }
      var ratio = (p - c) / p;
      var text = "Lãi gộp " + money(p - c) + " / " + (unit ? unit.value : "cái") + " · Biên lợi nhuận " + (ratio * 100).toFixed(1).replace(".", ",") + "%";
      if (o && o > p) text += " · Đang giảm " + Math.round((o - p) / o * 100) + "% so với giá gốc";
      if (c >= p) text += ". Giá vốn không thấp hơn giá bán — mỗi sản phẩm bán ra sẽ bị lỗ.";
      else if (ratio < 0.2) text += ". Biên lợi nhuận dưới 20%.";
      margin.textContent = text;
      margin.className = "flash " + (c >= p ? "flash-error" : ratio < 0.2 ? "flash-warn" : "flash-ok");
    }
    [price, cost, compare, unit].forEach(function (el) { if (el) el.addEventListener("input", updateMargin); if (el) el.addEventListener("change", updateMargin); });
    if (margin) updateMargin();
    var imgInput = form.querySelector("[data-image-input]");
    var img = form.querySelector("[data-image-preview]");
    // Chọn file ảnh: báo ngay nếu quá 2 MB hoặc sai loại, còn hợp lệ thì xem trước luôn (máy chủ vẫn kiểm tra lại).
    var file = form.querySelector("[data-image-file]");
    var fileName = form.querySelector("[data-image-file-name]");
    var fileError = form.querySelector("[data-image-error]");
    if (file && img) file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      var problem = "";
      if (f && !/\.(jpe?g|png|webp)$/i.test(f.name)) problem = "Chỉ nhận ảnh JPG, PNG hoặc WEBP";
      else if (f && f.size > Number(file.getAttribute("data-max-bytes"))) problem = "Ảnh tối đa 2 MB (file này " + (f.size / 1048576).toFixed(1).replace(".", ",").replace(/,0$/, "") + " MB)";
      fileError.textContent = problem;
      fileError.hidden = !problem;
      // Đã chọn file thì ảnh từ máy được dùng: khoá ô đường dẫn để khỏi nhầm (vẫn gửi đi, phòng khi file bị máy chủ từ chối).
      if (imgInput) { imgInput.readOnly = !problem && !!f; imgInput.classList.toggle("is-replaced", imgInput.readOnly); }
      if (problem || !f) { file.value = ""; fileName.textContent = "Chưa chọn file"; return; }
      fileName.textContent = f.name + " · " + Math.max(1, Math.round(f.size / 1024)) + " KB — sẽ thay cho đường dẫn bên dưới";
      img.hidden = false;
      delete img.dataset.fallback;
      img.src = URL.createObjectURL(f);
    });
    if (imgInput && img) imgInput.addEventListener("change", function () {
      var url = imgInput.value.trim();
      img.hidden = !url;
      delete img.dataset.fallback;
      if (url) img.src = url; else img.removeAttribute("src");
    });
  });

  // Nút điền sẵn giá trị (gợi ý mã) và nút tạo mã vạch EAN-13 đầu 893.
  document.addEventListener("click", function (event) {
    var fill = event.target.closest && event.target.closest("[data-fill]");
    if (fill) { document.querySelector(fill.getAttribute("data-fill")).value = fill.getAttribute("data-value"); return; }
    var ean = event.target.closest && event.target.closest("[data-ean13]");
    if (ean) {
      var body = "893";
      for (var i = 0; i < 9; i++) body += Math.floor(Math.random() * 10);
      var sum = 0;
      for (var k = 0; k < 12; k++) sum += parseInt(body[k], 10) * (k % 2 === 0 ? 1 : 3);
      document.querySelector(ean.getAttribute("data-ean13")).value = body + ((10 - sum % 10) % 10);
      return;
    }
    var copy = event.target.closest && event.target.closest("[data-copy]");
    if (copy) {
      var code = copy.getAttribute("data-copy");
      var done = function (ok) {
        var old = copy.getAttribute("data-label") || copy.textContent;
        copy.setAttribute("data-label", old);
        copy.textContent = ok ? "Đã sao chép" : "Chép thủ công: " + code;
        setTimeout(function () { copy.textContent = old; }, 2000);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(false); });
      else done(false);
    }
  });

  // ---------------------------------------------------------------- form khuyến mãi
  document.querySelectorAll("[data-promotion-form]").forEach(function (form) {
    function apply() {
      var type = form.getAttribute("data-type");
      form.querySelectorAll("[data-show]").forEach(function (el) {
        var show = el.getAttribute("data-show").split(" ").indexOf(type) !== -1;
        el.hidden = !show;
        el.querySelectorAll("input, select, textarea").forEach(function (input) {
          var inHidden = input.closest("[data-show][hidden]");
          input.disabled = !!inHidden;
        });
      });
      var label = form.querySelector("[data-value-label]");
      var unit = form.querySelector("[data-value-unit]");
      if (label) label.textContent = type === "Fixed" ? "Số tiền giảm" : "Mức giảm";
      if (unit) unit.textContent = type === "Fixed" ? "₫" : "%";
    }
    form.querySelectorAll("[data-type-radio]").forEach(function (radio) {
      radio.addEventListener("change", function () {
        form.setAttribute("data-type", radio.value);
        var value = form.querySelector("[name=Value]");
        if (value) value.value = "";
        apply();
      });
    });
    form.querySelectorAll("[data-window]").forEach(function (b) {
      b.addEventListener("click", function () {
        var parts = b.getAttribute("data-window").split(" ");
        form.querySelector("#daily-start").value = parts[0];
        form.querySelector("#daily-end").value = parts[1];
      });
    });
    var buy = form.querySelector("[data-buy]"), get = form.querySelector("[data-get]"), note = form.querySelector("[data-bxgy-note]");
    function bxgy() {
      var x = parseInt(buy.value, 10) || 0, y = parseInt(get.value, 10) || 0;
      note.textContent = "Khách lấy " + (x + y) + " sản phẩm cùng loại chỉ trả tiền " + x + "; phần tặng tính theo giá đang bán (kể cả giá flash sale).";
    }
    if (buy && get && note) { buy.addEventListener("input", bxgy); get.addEventListener("input", bxgy); bxgy(); }
    apply();
  });

  // Chọn sản phẩm áp dụng: gõ để tìm, bấm để chọn/bỏ, mỗi sản phẩm đã chọn là một ô ẩn ProductIds.
  document.querySelectorAll("[data-picker]").forEach(function (picker) {
    var url = picker.getAttribute("data-search-url");
    var search = picker.querySelector("[data-picker-search]");
    var results = picker.querySelector("[data-picker-results]");
    var chips = picker.querySelector("[data-picker-chips]");
    var inputs = picker.querySelector("[data-picker-inputs]");
    var picked = JSON.parse(picker.getAttribute("data-picked") || "[]");
    function render() {
      chips.innerHTML = "";
      inputs.innerHTML = "";
      picked.forEach(function (p) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip-soft chip-brand toggle-btn";
        chip.textContent = p.name + " ✕";
        chip.title = "Bỏ chọn " + p.name;
        chip.addEventListener("click", function () { picked = picked.filter(function (x) { return x.id !== p.id; }); render(); });
        chips.appendChild(chip);
        var hidden = document.createElement("input");
        hidden.type = "hidden"; hidden.name = "ProductIds"; hidden.value = p.id;
        inputs.appendChild(hidden);
      });
      if (picked.length > 1) {
        var clear = document.createElement("button");
        clear.type = "button"; clear.className = "btn btn-sm"; clear.textContent = "Bỏ chọn tất cả";
        clear.addEventListener("click", function () { picked = []; render(); });
        chips.appendChild(clear);
      }
    }
    var timer = null;
    function load() {
      fetch(url + "?q=" + encodeURIComponent(search.value)).then(function (r) { return r.json(); }).then(function (data) {
        results.innerHTML = "";
        var head = document.createElement("li");
        head.className = "cell-sub";
        head.textContent = data.items.length < data.total ? data.items.length + " / " + data.total + " sản phẩm – gõ để lọc thêm" : data.total + " sản phẩm";
        results.appendChild(head);
        if (!data.items.length) { head.textContent = "Không tìm thấy sản phẩm phù hợp"; return; }
        data.items.forEach(function (p) {
          var li = document.createElement("li");
          var on = picked.some(function (x) { return x.id === p.id; });
          li.innerHTML = '<label class="check" style="cursor:pointer"><input type="checkbox"' + (on ? " checked" : "") + '> <span></span></label>';
          li.querySelector("span").textContent = p.name + " · " + p.price + " · " + p.sku;
          li.querySelector("input").addEventListener("change", function (ev) {
            if (ev.target.checked) picked.push(p); else picked = picked.filter(function (x) { return x.id !== p.id; });
            render();
          });
          results.appendChild(li);
        });
      });
    }
    search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 200); });
    search.addEventListener("focus", function () { if (!results.children.length) load(); });
    search.addEventListener("keydown", function (ev) { if (ev.key === "Enter") ev.preventDefault(); });
    render();
  });

  // ---------------------------------------------------------------- chốt ca: đếm theo mệnh giá, chênh lệch
  document.querySelectorAll("[data-cashup]").forEach(function (form) {
    var expected = parseInt(form.getAttribute("data-expected"), 10) || 0;
    var counted = form.querySelector("[data-counted]");
    var diff = form.querySelector("[data-diff]");
    var noteLabel = form.querySelector("[data-note-label]");
    var fmt = function (n) { return n.toLocaleString("vi-VN") + " ₫"; };
    function update() {
      var v = parseInt((counted.value || "").replace(/\D/g, ""), 10);
      if (isNaN(v)) { diff.textContent = "Nhập số tiền để đối chiếu"; diff.className = "cell-sub"; noteLabel.textContent = "Ghi chú"; return; }
      var d = v - expected;
      diff.textContent = d === 0 ? "Khớp" : d > 0 ? "Thừa " + fmt(d) : "Thiếu " + fmt(-d);
      diff.className = "badge " + (d === 0 ? "fresh" : d > 0 ? "warning" : "danger");
      noteLabel.textContent = d === 0 ? "Ghi chú" : "Ghi chú (bắt buộc khi lệch tiền)";
    }
    form.querySelectorAll("[data-note]").forEach(function (input) {
      input.addEventListener("input", function () {
        var total = 0;
        form.querySelectorAll("[data-note]").forEach(function (n) { total += (parseInt(n.value, 10) || 0) * parseInt(n.getAttribute("data-note"), 10); });
        counted.value = total;
        update();
      });
    });
    counted.addEventListener("input", update);
    update();
  });

  // ---------------------------------------------------------------- kho: chênh lệch khi điều chỉnh, nút "Khớp" khi kiểm kê
  document.querySelectorAll("[data-adjust]").forEach(function (form) {
    var system = parseInt(form.getAttribute("data-system"), 10) || 0;
    var actual = form.querySelector("[data-actual]");
    var out = form.querySelector("[data-adjust-diff]");
    function update() {
      var v = parseInt((actual.value || "").replace(/\D/g, ""), 10);
      if (isNaN(v)) { out.textContent = "Nhập số lượng thực tế (số nguyên từ 0)"; return; }
      var d = v - system;
      out.textContent = "Chênh lệch: " + (d > 0 ? "+" + d : d);
      out.className = "badge " + (d === 0 ? "neutral" : d > 0 ? "warning" : "danger");
    }
    actual.addEventListener("input", update);
    update();
  });
  document.querySelectorAll("[data-stocktake]").forEach(function (form) {
    form.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-match]");
      if (!b) return;
      var input = b.parentElement.querySelector("[data-count]");
      input.value = b.getAttribute("data-match");
    });
    var inputs = Array.prototype.slice.call(form.querySelectorAll("[data-count]"));
    inputs.forEach(function (input, i) {
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === "ArrowDown") { ev.preventDefault(); if (inputs[i + 1]) inputs[i + 1].focus(); }
        if (ev.key === "ArrowUp") { ev.preventDefault(); if (inputs[i - 1]) inputs[i - 1].focus(); }
      });
    });
  });

  // ---------------------------------------------------------------- báo cáo: kỳ tuỳ chọn, xuất CSV
  document.querySelectorAll("[data-report-filter]").forEach(function (form) {
    var period = form.querySelector("[data-period]");
    var range = form.querySelector("[data-range]");
    period.addEventListener("change", function () {
      if (period.value === "tuy-chon") { range.hidden = false; range.querySelector("input").focus(); return; }
      range.hidden = true;
      form.submit();
    });
  });
  document.querySelectorAll("a[download]").forEach(function (link) {
    link.addEventListener("click", function () {
      var main = document.querySelector("main") || document.body;
      var old = main.querySelector(".flash-js");
      if (old) old.remove();
      var note = document.createElement("div");
      note.className = "flash flash-ok flash-js";
      note.setAttribute("role", "status");
      note.textContent = "Đã xuất file CSV";
      main.insertBefore(note, main.firstChild);
      setTimeout(function () { note.remove(); }, 4000);
    });
  });

  // ---------------------------------------------------------------- báo đơn online mới trên mọi trang quản lý
  (function () {
    var feed = document.body.getAttribute("data-orders-feed");
    if (!feed) return;
    var badge = document.querySelector("[data-pending-count]");
    var seen = null;
    function show(codes) {
      var main = document.querySelector("main") || document.body;
      var old = main.querySelector(".flash-new-order");
      if (old) old.remove();
      var note = document.createElement("div");
      note.className = "flash flash-ok flash-new-order";
      note.setAttribute("role", "status");
      var text = document.createElement("span");
      text.textContent = codes.length === 1 ? "Có đơn online mới " + codes[0] : "Có " + codes.length + " đơn online mới";
      var link = document.createElement("a");
      link.href = codes.length === 1 ? "/Admin/Orders/Detail/" + encodeURIComponent(codes[0]) : "/Admin/Orders";
      link.textContent = "Xem đơn";
      link.style.marginLeft = "auto";
      note.appendChild(text);
      note.appendChild(link);
      main.insertBefore(note, main.firstChild);
    }
    function poll() {
      fetch(feed, { headers: { "X-Requested-With": "fetch" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          if (badge) { badge.textContent = data.count; badge.hidden = data.count === 0; }
          if (seen === null) { seen = data.codes; return; }
          var fresh = data.codes.filter(function (c) { return seen.indexOf(c) < 0; });
          seen = seen.concat(fresh);
          if (fresh.length) show(fresh);
        })
        .catch(function () {});
    }
    poll();
    setInterval(poll, 20000);
  })();

  // Đóng menu tài khoản khi bấm ra ngoài.
  document.addEventListener("click", function (event) {
    document.querySelectorAll("details.user-menu[open]").forEach(function (d) {
      if (!d.contains(event.target)) d.removeAttribute("open");
    });
  });

  // Phiếu nhập: điền nhanh cột "Nhận đợt này" (đủ phần còn thiếu, hoặc về 0 để chỉ nhập vài dòng).
  document.querySelectorAll("[data-receive-fill]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.getAttribute("data-receive-fill");
      document.querySelectorAll("[data-receive-qty]").forEach(function (input) {
        input.value = mode === "max" ? input.getAttribute("max") : "0";
      });
    });
  });
})();
