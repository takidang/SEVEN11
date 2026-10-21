/*
 * sevenpricing — lõi tính tiền của giỏ hàng 7-Eleven (đồ án môn học), viết bằng C++17.
 *
 * C# (SevenEleven.Core/Services/PricingService.cs) quyết định khuyến mãi nào áp cho dòng nào
 * (ngày giờ, kênh bán, hạng thành viên, phạm vi sản phẩm, điều kiện mã). Lõi này làm phần tính
 * tiền: giá flash sale, mua X tặng Y, voucher đồ uống theo hạng, mã giảm giá, phí giao, chi tiêu
 * tính hạng; cộng thêm tích sao và khoảng cách giao hàng. Mọi số tiền là số nguyên VND, làm tròn
 * "nửa lên" giống Math.round của JavaScript để khớp bản Next.js từng đồng.
 *
 * Giao diện C thuần (extern "C", struct chỉ chứa số nguyên/số thực) để C# gọi qua P/Invoke trên
 * macOS, Linux và Windows.
 */
#ifndef SEVENPRICING_H
#define SEVENPRICING_H

#include <stdint.h>

#if defined(_WIN32)
#  define SE_API __declspec(dllexport)
#else
#  define SE_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Một dòng hàng, khuyến mãi đã được C# chọn sẵn. */
typedef struct {
    int32_t unit_price;     /* giá niêm yết một đơn vị */
    int32_t quantity;       /* > 0 */
    int32_t flash_percent;  /* 0 = không có flash sale */
    int32_t buy_quantity;   /* 0 = không có mua X tặng Y */
    int32_t get_quantity;
    int32_t is_drink;       /* được voucher đồ uống theo hạng */
    int32_t is_alcohol;     /* không tính vào chi tiêu hạng và sao */
    int32_t code_eligible;  /* thuộc phạm vi của mã giảm giá */
} se_line;

enum { SE_CODE_NONE = 0, SE_CODE_PERCENT = 1, SE_CODE_FIXED = 2 };

typedef struct {
    int32_t member_voucher;     /* giảm mỗi ly đồ uống; 0 = không áp */
    int32_t max_cups;           /* tối đa số ly được giảm mỗi đơn */
    int32_t code_type;          /* SE_CODE_* */
    int32_t code_value;         /* phần trăm 0–100 hoặc số tiền */
    int32_t code_max_discount;  /* trần giảm của mã phần trăm; 0 = không giới hạn */
    int32_t delivery;           /* đơn giao tận nơi */
    int32_t shipping_fee;
    int32_t free_shipping_from;
} se_cart_options;

typedef struct {
    int32_t sale_price;     /* giá một đơn vị sau flash sale */
    int32_t free_units;     /* số đơn vị được tặng (mua X tặng Y) */
    int64_t line_subtotal;  /* giá niêm yết × số lượng */
    int64_t line_discount;  /* flash sale + mua X tặng Y */
    int64_t line_total;
} se_line_result;

typedef struct {
    int64_t subtotal;
    int64_t line_discounts;
    int64_t member_discount;
    int64_t code_eligible_total; /* tiền hàng thuộc phạm vi mã; 0 nghĩa là mã không áp được */
    int64_t code_discount;
    int64_t discount_total;
    int32_t item_count;
    int32_t shipping_fee;
    int32_t free_shipping;
    int64_t total;
    int64_t eligible_spend;      /* chi tiêu tính hạng và sao: sau mọi giảm giá, trừ đồ có cồn */
} se_cart_result;

/* Phiên bản thư viện, ví dụ "1.0.0". */
SE_API const char* se_version(void);

/* Giá flash sale một đơn vị: giảm theo phần trăm, làm tròn tới 1.000 ₫, giảm ít nhất 1.000 ₫. */
SE_API int32_t se_flash_price(int32_t price, int32_t percent);

/* Tính cả giỏ. Trả về 0 khi thành công, số âm khi đầu vào sai (con trỏ rỗng, số lượng âm). */
SE_API int32_t se_price_cart(const se_line* lines, int32_t count, const se_cart_options* options,
                             se_line_result* line_results, se_cart_result* result);

/* Tích sao: cứ star_spend đồng được 1 sao, phần lẻ cộng dồn sang lần sau. */
SE_API void se_earn_stars(int32_t carry, int64_t spend, int32_t star_spend, int32_t* stars, int32_t* new_carry);

/* Khoảng cách đường chim bay giữa hai toạ độ, km (công thức haversine). */
SE_API double se_distance_km(double lat1, double lng1, double lat2, double lng2);

#ifdef __cplusplus
}
#endif

#endif /* SEVENPRICING_H */
