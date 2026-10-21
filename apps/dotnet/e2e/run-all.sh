#!/bin/bash
# Chạy trọn bộ kiểm thử, lặp N vòng (mặc định 1), dừng ngay ở vòng đầu tiên có lỗi:
#   1. build cả solution (kèm thư viện C++)
#   2. dotnet test: nghiệp vụ, so khớp C++/C#, tranh chấp đồng thời, mô phỏng ngẫu nhiên (hạt giống đổi mỗi vòng)
#   3. bật máy chủ trên cơ sở dữ liệu tạm mới tinh (nạp dữ liệu mẫu) ở cổng 5790
#   4. bò đồ thị trang theo 5 vai trò + kịch bản trình duyệt (quản lý, quầy, cửa hàng online)
#
#   e2e/run-all.sh [số vòng]          PLAYWRIGHT_PATH=…  nếu playwright không nằm cạnh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOOPS="${1:-1}"
PORT="${PORT:-5790}"
WORK="$(mktemp -d)"
DB="$WORK/e2e.db"
BASE="http://localhost:$PORT"
SERVER=""
trap '[ -n "$SERVER" ] && kill $SERVER 2>/dev/null; rm -rf "$WORK"' EXIT

cd "$ROOT"
dotnet build SevenEleven.sln -nologo -v q 2>&1 | grep -E " error |Build succeeded|Warn" | sort -u
[ "${PIPESTATUS[0]}" -eq 0 ] || { echo "Build hỏng"; exit 1; }

for loop in $(seq 1 "$LOOPS"); do
  echo "================ Vòng $loop/$LOOPS ================"
  SEEDS="$((loop * 7 + 1)),$((loop * 13 + 2))"
  SIM_SEEDS="$SEEDS" SIM_OPS="${SIM_OPS:-1500}" dotnet test SevenEleven.Tests --no-build -nologo -v q 2>&1 | tail -1
  [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "dotnet test hỏng ở vòng $loop (hạt giống $SEEDS)"; exit 1; }

  rm -f "$DB"*
  if lsof -ti "tcp:$PORT" > /dev/null 2>&1; then echo "Cổng $PORT đang bận (máy chủ cũ còn chạy?) — dừng"; exit 1; fi
  # Chạy thẳng tiến trình dotnet (không qua shell con) để $SERVER đúng là máy chủ, tắt được chắc chắn.
  ASPNETCORE_ENVIRONMENT=Development ConnectionStrings__Default="Data Source=$DB" \
    dotnet SevenEleven.Web/bin/Debug/net8.0/SevenEleven.Web.dll --contentRoot "$ROOT/SevenEleven.Web" --urls "$BASE" \
    > "$WORK/server.log" 2>&1 &
  SERVER=$!
  for i in $(seq 1 120); do
    kill -0 $SERVER 2>/dev/null || { echo "Máy chủ không khởi động được:"; tail -20 "$WORK/server.log"; exit 1; }
    curl -sf -o /dev/null "$BASE/" && break
    sleep 1
  done

  fail=0
  node e2e/crawl.cjs "$BASE" || fail=1
  node e2e/admin-flows.cjs "$BASE" || fail=1
  node e2e/pos-flow.cjs "$BASE" || fail=1
  node e2e/storefront-flow.cjs "$BASE" || fail=1
  node e2e/storefront-pages.cjs "$BASE" || fail=1
  if grep -q "Unhandled exception\|fail: " "$WORK/server.log"; then
    echo "Máy chủ ghi lỗi:"; grep -A3 "fail: " "$WORK/server.log" | head -40; fail=1
  fi
  kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null
  [ $fail -eq 0 ] || { echo "Vòng $loop hỏng"; exit 1; }
  echo "Vòng $loop sạch"
done
echo "Tất cả $LOOPS vòng đều sạch"
