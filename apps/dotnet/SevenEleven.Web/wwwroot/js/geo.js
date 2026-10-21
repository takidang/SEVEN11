// Định vị cho trang Cửa hàng ("Gần tôi") và form địa chỉ ("Dùng vị trí hiện tại").
// Chuyển từ lib/geo.ts và lib/geocode.ts bên Next.js. Khoảng cách tính bằng haversine ngay trên
// trình duyệt; tên đường lấy từ hai dịch vụ bản đồ miễn phí, hỏng cả hai thì khách tự nhập.
(function () {
  "use strict";

  var EARTH_KM = 6371;

  function rad(deg) { return (deg * Math.PI) / 180; }

  function distanceKm(a, b) {
    var dLat = rad(b.lat - a.lat);
    var dLng = rad(b.lng - a.lng);
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
  }

  function formatDistance(km) {
    if (km < 1) return Math.round(km * 100) * 10 + " m";
    return (Math.round(km * 10) / 10).toString().replace(".", ",") + " km";
  }

  /** Vị trí hiện tại, luôn đo mới (không lấy vị trí cũ trình duyệt đã nhớ). */
  function requestLocation() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error("unsupported"));
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        reject,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    });
  }

  function locationError(error) {
    if (error && error.code === 1) return "Bạn đã chặn quyền vị trí. Mở lại trong cài đặt trình duyệt rồi thử lại.";
    if (error && error.code === 3) return "Lấy vị trí quá lâu, bạn thử lại ở nơi thoáng hơn.";
    if (error && error.message === "unsupported") return "Trình duyệt này không hỗ trợ định vị.";
    return "Chưa lấy được vị trí, bạn thử lại hoặc nhập tay.";
  }

  function pick(source, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = source[keys[i]];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  function joinLine(house, street) { return street ? (house + " " + street).trim() : ""; }

  function fromNominatim(point) {
    var q = new URLSearchParams({ format: "jsonv2", lat: point.lat, lon: point.lng, zoom: "18", addressdetails: "1", "accept-language": "vi" });
    return fetch("https://nominatim.openstreetmap.org/reverse?" + q).then(function (res) {
      if (!res.ok) throw new Error("Nominatim " + res.status);
      return res.json();
    }).then(function (data) {
      var a = data && data.address;
      if (!a) return null;
      return {
        line: joinLine(pick(a, ["house_number"]), pick(a, ["road", "pedestrian", "residential", "neighbourhood"])),
        ward: pick(a, ["quarter", "suburb", "village", "town", "city_district"]),
        province: pick(a, ["city", "state", "province"]),
        source: "OpenStreetMap",
      };
    });
  }

  function fromPhoton(point) {
    var q = new URLSearchParams({ lat: point.lat, lon: point.lng, lang: "default" });
    return fetch("https://photon.komoot.io/reverse?" + q).then(function (res) {
      if (!res.ok) throw new Error("Photon " + res.status);
      return res.json();
    }).then(function (data) {
      var p = data && data.features && data.features[0] && data.features[0].properties;
      if (!p) return null;
      return {
        line: joinLine(pick(p, ["housenumber"]), pick(p, ["street", "name"])),
        ward: pick(p, ["district", "locality", "city"]),
        province: pick(p, ["state", "county", "city"]),
        source: "Photon",
      };
    });
  }

  /** Thử lần lượt hai nguồn bản đồ; hỏng cả hai thì trả null. */
  function lookupAddress(point) {
    var providers = [fromNominatim, fromPhoton];
    var i = 0;
    function next() {
      if (i >= providers.length) return Promise.resolve(null);
      var provider = providers[i++];
      return provider(point).then(function (found) {
        if (found && (found.province || found.ward || found.line)) return found;
        return next();
      }, function (error) {
        console.warn("[geocode] không đọc được địa chỉ từ một nguồn bản đồ:", error);
        return next();
      });
    }
    return next();
  }

  /** "Thành phố Hồ Chí Minh" → "TP Hồ Chí Minh" theo đúng tên tỉnh dùng trong ứng dụng. */
  function matchProvince(name, known) {
    var plain = (name || "").toLowerCase();
    for (var i = 0; i < known.length; i++) {
      if (plain.indexOf(known[i].replace(/^TP\s+/i, "").toLowerCase()) !== -1) return known[i];
    }
    return null;
  }

  function nearest(point, stores) {
    var best = null;
    stores.forEach(function (s) {
      var km = distanceKm(point, s);
      if (!best || km < best.km) best = { store: s, km: km };
    });
    return best;
  }

  // ---------------------------------------------------------------- form địa chỉ

  document.querySelectorAll("[data-locate]").forEach(function (box) {
    var form = document.getElementById("address-form");
    var button = box.querySelector("[data-locate-button]");
    var status = box.querySelector("[data-locate-status]");
    var result = form.querySelector("[data-locate-result]");
    var stores = JSON.parse(box.getAttribute("data-stores") || "[]");
    var radius = parseFloat(box.getAttribute("data-radius") || "5");
    var field = function (name) { return form.querySelector('[data-field="' + name + '"]'); };
    var provinceSelect = field("province");
    var known = Array.prototype.map.call(provinceSelect.options, function (o) { return o.value; });

    function showStore(point) {
      var found = nearest(point, stores);
      if (!found) return;
      var far = found.km > radius;
      result.hidden = false;
      result.className = "locate-result alert " + (far ? "alert-error" : "alert-ok");
      result.textContent = far
        ? "Cửa hàng gần nhất (" + found.store.code + " – " + found.store.name + ") cách " + formatDistance(found.km) +
          ", ngoài vùng giao " + radius + " km. Bạn vẫn lưu được địa chỉ nhưng chưa đặt giao tới đây được."
        : "Giao từ cửa hàng " + found.store.code + " – " + found.store.name + ", cách " + formatDistance(found.km) + ".";
    }

    button.addEventListener("click", function () {
      button.disabled = true;
      status.textContent = "Đang lấy vị trí…";
      requestLocation().then(function (point) {
        field("lat").value = point.lat;
        field("lng").value = point.lng;
        showStore(point);
        status.textContent = "Đang đọc tên đường…";
        return lookupAddress(point).then(function (place) {
          if (!place) {
            status.textContent = "Đã lưu vị trí nhưng chưa đọc được tên đường, bạn nhập tay giúp nhé.";
            return;
          }
          if (place.line) field("line").value = place.line;
          if (place.ward) field("ward").value = place.ward;
          var province = matchProvince(place.province, known);
          if (province) provinceSelect.value = province;
          status.textContent = province
            ? "Đã điền địa chỉ theo vị trí (" + place.source + "). Kiểm tra lại số nhà trước khi lưu."
            : "Vị trí này ở " + place.province + ", chưa có cửa hàng 7-Eleven nào trong tỉnh.";
        });
      }, function (error) {
        status.textContent = locationError(error);
      }).finally(function () {
        button.disabled = false;
      });
    });

    var lat = parseFloat(field("lat").value);
    var lng = parseFloat(field("lng").value);
    if (!isNaN(lat) && !isNaN(lng)) showStore({ lat: lat, lng: lng });
  });

  // ---------------------------------------------------------------- danh sách cửa hàng

  function fold(text) {
    return (text || "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  document.querySelectorAll("[data-store-directory]").forEach(function (root) {
    var list = root.querySelector("[data-store-list]");
    var button = root.querySelector("[data-near-me]");
    var status = root.querySelector("[data-near-status]");
    var count = root.querySelector("[data-count]");
    var suffix = root.querySelector("[data-near-suffix]");
    var empty = root.querySelector("[data-store-empty]");
    var search = root.querySelector("[data-store-search]");
    var provinceInput = root.querySelector("[data-province-input]");
    var chips = root.querySelectorAll("[data-province-chip]");
    var cards = Array.prototype.slice.call(list.querySelectorAll("[data-store]"));
    var province = (Array.prototype.find.call(chips, function (c) { return c.getAttribute("aria-pressed") === "true"; }) || chips[0]).getAttribute("data-province-chip");

    // Lọc tại chỗ theo tỉnh + từ khoá (mọi từ đều có, không dấu), giống bản Next.js.
    function apply() {
      var terms = fold(search ? search.value : "").split(/\s+/).filter(Boolean);
      var shown = 0;
      cards.forEach(function (card) {
        var text = card.getAttribute("data-text") || "";
        var ok = (province === "" || card.getAttribute("data-province") === province) && terms.every(function (t) { return text.indexOf(t) >= 0; });
        card.hidden = !ok;
        if (ok) shown++;
      });
      chips.forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-province-chip") === province ? "true" : "false"); });
      if (provinceInput) provinceInput.value = province === "" ? "tat-ca" : province;
      if (count) count.textContent = shown;
      if (empty) empty.hidden = shown > 0;
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function (event) {
        event.preventDefault();
        province = chip.getAttribute("data-province-chip");
        apply();
      });
    });
    if (search) {
      var timer;
      search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(apply, 120); });
      search.form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });
    }

    button.addEventListener("click", function () {
      button.disabled = true;
      requestLocation().then(function (point) {
        cards.forEach(function (card) {
          var km = distanceKm(point, { lat: parseFloat(card.getAttribute("data-lat")), lng: parseFloat(card.getAttribute("data-lng")) });
          card.setAttribute("data-km", km);
          card.querySelector("[data-distance]").textContent = " · cách " + formatDistance(km);
        });
        cards.sort(function (a, b) { return parseFloat(a.getAttribute("data-km")) - parseFloat(b.getAttribute("data-km")); });
        cards.forEach(function (card) { list.appendChild(card); });
        // Mở đúng tỉnh có cửa hàng gần nhất, như khi khách chọn tỉnh.
        var open = cards.filter(function (c) { return c.getAttribute("data-open") === "true"; });
        if (open[0]) province = open[0].getAttribute("data-province");
        apply();
        if (suffix) suffix.textContent = ", gần bạn nhất trước";
        if (window.ShopToast) window.ShopToast({ title: "Đã sắp xếp theo cửa hàng gần bạn nhất", tone: "success" });
        else if (status) status.setAttribute("data-sorted", "true");
      }, function (error) {
        if (window.ShopToast) window.ShopToast({ title: "Không lấy được vị trí", desc: "Bật quyền vị trí cho trình duyệt rồi thử lại.", tone: "error" });
        else if (status) status.textContent = locationError(error);
      }).finally(function () {
        button.disabled = false;
      });
    });
  });
})();
