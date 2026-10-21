#include "sevenpricing.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <vector>

namespace {

constexpr double kEarthRadiusKm = 6371.0;
constexpr double kPi = 3.14159265358979323846;

/* Làm tròn "nửa lên" như Math.round của JavaScript (các số ở đây luôn không âm). */
int64_t round_half_up(double value) { return static_cast<int64_t>(std::floor(value + 0.5)); }

}  // namespace

extern "C" {

const char* se_version(void) { return "1.0.0"; }

int32_t se_flash_price(int32_t price, int32_t percent) {
    const int64_t off = std::max<int64_t>(1000, round_half_up(price * static_cast<double>(percent) / 100.0 / 1000.0) * 1000);
    return static_cast<int32_t>(std::max<int64_t>(0, price - off));
}

int32_t se_price_cart(const se_line* lines, int32_t count, const se_cart_options* options,
                      se_line_result* line_results, se_cart_result* result) {
    if (count < 0 || options == nullptr || result == nullptr || (count > 0 && (lines == nullptr || line_results == nullptr))) return -1;

    se_cart_result r{};
    int64_t after_lines = 0;

    // 1. Từng dòng: flash sale rồi mua X tặng Y (quà tính theo giá đã giảm).
    for (int32_t i = 0; i < count; ++i) {
        const se_line& line = lines[i];
        if (line.quantity <= 0 || line.unit_price < 0) return -2;
        se_line_result lr{};
        lr.sale_price = line.flash_percent > 0 ? se_flash_price(line.unit_price, line.flash_percent) : line.unit_price;
        lr.line_subtotal = static_cast<int64_t>(line.unit_price) * line.quantity;
        lr.line_discount = static_cast<int64_t>(line.unit_price - lr.sale_price) * line.quantity;
        if (line.buy_quantity > 0 && line.get_quantity > 0) {
            lr.free_units = line.quantity / (line.buy_quantity + line.get_quantity) * line.get_quantity;
            lr.line_discount += static_cast<int64_t>(lr.free_units) * lr.sale_price;
        }
        lr.line_total = lr.line_subtotal - lr.line_discount;
        line_results[i] = lr;

        r.subtotal += lr.line_subtotal;
        r.line_discounts += lr.line_discount;
        after_lines += lr.line_total;
        r.item_count += line.quantity;
    }

    // 2. Voucher đồ uống theo hạng: tối đa max_cups ly, ly đắt trước; giá bằng nhau thì giữ thứ tự giỏ.
    if (options->member_voucher > 0 && options->max_cups > 0) {
        std::vector<int32_t> drinks;
        for (int32_t i = 0; i < count; ++i)
            if (lines[i].is_drink) drinks.push_back(i);
        std::stable_sort(drinks.begin(), drinks.end(),
                         [&](int32_t a, int32_t b) { return line_results[a].sale_price > line_results[b].sale_price; });
        int32_t cups = options->max_cups;
        for (int32_t i : drinks) {
            if (cups <= 0) break;
            const int32_t use = std::min(cups, lines[i].quantity);
            r.member_discount += static_cast<int64_t>(std::min(options->member_voucher, line_results[i].sale_price)) * use;
            cups -= use;
        }
    }

    // 3. Mã giảm giá: chỉ tính trên các dòng thuộc phạm vi mã, không giảm quá số còn phải trả.
    const int64_t base_amount = after_lines - r.member_discount;
    if (options->code_type != SE_CODE_NONE) {
        for (int32_t i = 0; i < count; ++i)
            if (lines[i].code_eligible) r.code_eligible_total += line_results[i].line_total;
        if (r.code_eligible_total > 0) {
            int64_t discount = 0;
            if (options->code_type == SE_CODE_PERCENT) {
                discount = round_half_up(r.code_eligible_total * static_cast<double>(options->code_value) / 100.0);
                if (options->code_max_discount > 0) discount = std::min<int64_t>(discount, options->code_max_discount);
            } else {
                discount = std::min<int64_t>(options->code_value, r.code_eligible_total);
            }
            r.code_discount = std::min<int64_t>(discount, std::max<int64_t>(0, base_amount));
        }
    }

    // 4. Phí giao: miễn khi số phải trả (chưa kể phí) đạt ngưỡng.
    r.discount_total = r.line_discounts + r.member_discount + r.code_discount;
    const int64_t payable = std::max<int64_t>(0, r.subtotal - r.discount_total);
    r.free_shipping = options->delivery && payable >= options->free_shipping_from ? 1 : 0;
    r.shipping_fee = options->delivery && r.item_count > 0 && !r.free_shipping ? options->shipping_fee : 0;
    r.total = payable + r.shipping_fee;

    // 5. Chi tiêu tính hạng: tiền hàng không có cồn, trừ voucher hạng và mã.
    int64_t eligible = 0;
    for (int32_t i = 0; i < count; ++i)
        if (!lines[i].is_alcohol) eligible += line_results[i].line_total;
    r.eligible_spend = std::max<int64_t>(0, eligible - r.member_discount - r.code_discount);

    *result = r;
    return 0;
}

void se_earn_stars(int32_t carry, int64_t spend, int32_t star_spend, int32_t* stars, int32_t* new_carry) {
    const int64_t pool = carry + std::max<int64_t>(0, spend);
    if (stars) *stars = star_spend > 0 ? static_cast<int32_t>(pool / star_spend) : 0;
    if (new_carry) *new_carry = star_spend > 0 ? static_cast<int32_t>(pool % star_spend) : static_cast<int32_t>(pool);
}

double se_distance_km(double lat1, double lng1, double lat2, double lng2) {
    auto rad = [](double deg) { return deg * kPi / 180.0; };
    const double d_lat = rad(lat2 - lat1);
    const double d_lng = rad(lng2 - lng1);
    const double h = std::pow(std::sin(d_lat / 2), 2) + std::cos(rad(lat1)) * std::cos(rad(lat2)) * std::pow(std::sin(d_lng / 2), 2);
    return 2 * kEarthRadiusKm * std::asin(std::sqrt(h));
}

}  // extern "C"
