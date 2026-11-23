# Cafe POS

Ứng dụng POS một quán, tiếng Việt. Đã có dữ liệu mẫu, đăng nhập, quản trị thực đơn/nhân viên/cài đặt và luồng mở ca → bán hàng → thanh toán → in → đóng ca.

## Docker (Node 22 + PostgreSQL 16)

```sh
docker compose up -d --build
```

Mở http://localhost:3000/login. Container tự chạy migration rồi seed **chỉ khi chưa có cửa hàng** (transaction + advisory lock). Dữ liệu được lưu trong volume `cafe_data`. Không cần dịch vụ ngoài hoặc tài nguyên CDN lúc chạy.

- Chủ quán: `owner@cafe.local` / `owner123`, hoặc PIN `1111`.
- Thu ngân: chọn **Lan**, PIN `2222`.
- Đổi `AUTH_SECRET` trong môi trường trước khi sử dụng ngoài máy cục bộ. Tài khoản mẫu và mật khẩu database chỉ phục vụ demo; đổi chúng trước triển khai thực tế. Dùng HTTPS để cookie có cờ Secure.

## Phát triển

```sh
source ~/.nvm/nvm.sh
nvm use 22
npm ci
cp .env.example .env
```

Prisma lấy `DATABASE_URL` từ môi trường; export các biến trong `.env` trước khi chạy CLI. Nếu chạy Node bên ngoài Docker, dùng PostgreSQL cục bộ hoặc mở cổng database qua compose override riêng (compose mặc định không công khai database).

```sh
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

```sh
npm run lint && npx tsc --noEmit && npm test
npm run build
```

Next.js 16 dùng `proxy.ts` thay tên `middleware.ts`; middleware kiểm tra JWT, các layout server kiểm tra lại người dùng trong database. Trang `/admin/*` và `/reports` chỉ dành cho chủ quán. Phiên hết hạn sau 12 giờ, cookie HttpOnly/SameSite=Lax. Môi trường HTTP local dùng cookie không Secure; HTTPS tự bật Secure.

Offline, đồng bộ, quản lý bàn nâng cao, hủy món/đơn bằng PIN chủ quán và báo cáo thuộc các giai đoạn sau. Giai đoạn hiện tại cần kết nối đến máy chủ POS. Bản in được kiểm tra trong trình duyệt, chưa thử máy in nhiệt thực tế.

## Quản trị (giai đoạn 2)

- `/admin/menu`: danh mục và thứ tự hiển thị, món với giá S/M/L, topping; chạm trạng thái để chuyển đang bán/hết hàng. Ảnh dùng URL http/https do chủ quán cung cấp, không có dịch vụ upload/cloud. URL ảnh cần truy cập được từ thiết bị tại quầy; bỏ trống để dùng biểu tượng mặc định.
- `/admin/staff`: thêm/sửa/xóa nhân viên, đặt lại PIN/mật khẩu và ngừng hoạt động. Để trống PIN/mật khẩu khi sửa để giữ nguyên. Không thể tự khóa, tự xóa hoặc hạ quyền tài khoản đang dùng. Tài khoản đã có lịch sử nên ngừng hoạt động thay vì xóa.
- `/admin/settings`: thông tin quán, danh sách BIN ngân hàng phổ biến, số/tên tài khoản, lời nhắn hóa đơn và khổ giấy 58/80 mm.
- API `/api/admin/{categories,products,toppings,users,settings}` kiểm tra OWNER đang hoạt động trong database ở mỗi yêu cầu; mọi thay đổi và AuditLog nằm trong cùng transaction. Dữ liệu liên quan đến lịch sử được bảo vệ bằng khóa ngoại. API không trả hash PIN/mật khẩu và audit không lưu thông tin bí mật.
- Nhân viên ngừng hoạt động không thể đăng nhập hoặc tiếp tục dùng phiên hiện có. Validation Zod dùng chung giữa form và server.

Kiểm tra tương tác quản trị (cần Compose đang chạy và Chrome cục bộ; dùng tài khoản demo mặc định hoặc biến `OWNER_EMAIL`/`OWNER_PASSWORD`):

```sh
CHROME_PATH=$(command -v google-chrome) SCREENSHOT_PATH=/home/ubuntu/shots/admin-menu.png node tests/e2e/admin-check.mjs
```

Script kiểm tra CRUD/giá size/hết hàng/PIN/ngừng hoạt động/cài đặt, chặn thu ngân, lưu ảnh màn hình và xóa dữ liệu kiểm thử sau khi chạy. AuditLog kiểm thử được giữ lại.

Tính tiền chỉ ở `lib/money.ts`: VND nguyên không âm, phần trăm nguyên 0–100, làm tròn nửa lên, giảm tiền tối đa bằng tạm tính, thiếu tiền mặt báo lỗi. VietQR tạo payload NAPAS + CRC16-CCITT-FALSE và PNG tại máy, không gọi API ngân hàng.

## Bán hàng (giai đoạn 3)

- `/shifts`: mở ca với tiền đầu ca; một ca dùng chung các thiết bị. Đóng ca sau khi thanh toán hết đơn chờ, nhập tiền thực đếm và xem chênh lệch. Tiền dự kiến = tiền đầu ca + tiền khách đưa − tiền thối; chuyển khoản không cộng vào két. Lịch sử hiển thị 50 ca gần nhất.
- `/pos`: chọn danh mục/tìm món, size M mặc định, topping, ghi chú nhanh và số lượng. Chạm dòng giỏ để sửa; biểu tượng thùng rác để xóa. Chọn mang đi/tại bàn, bàn và giảm giá %/số tiền. Món hết hàng bị khóa.
- Khi chạm **Thanh toán**, server chốt nội dung và giá từ thực đơn hiện tại, lưu snapshot tên/size/giá/topping/ghi chú. UUID do client tạo; mã `CFYYYYMMDD-0001` tăng tuần tự theo cửa hàng và ngày Việt Nam, được cấp trong transaction có khóa. Gửi lại cùng UUID/nội dung không tạo trùng đơn; gửi lại thanh toán không thu hai lần.
- Tiền mặt: nhập tiền hoặc chạm số gợi ý và xem tiền thối. Chuyển khoản: VietQR lớn có số tiền và mã đơn; thu ngân phải kiểm tra tiền về rồi xác nhận. Lưu người xác nhận cho cả hai phương thức. Không có xác minh ngân hàng tự động.
- Đơn đã chốt không sửa tại giỏ. Có thể đóng màn hình thanh toán và tiếp tục ở `/orders` (100 đơn gần nhất); đơn chờ được giữ trên server ngay cả khi tải lại trang. Giỏ chưa chốt chỉ nằm trong bộ nhớ trình duyệt.
- Sau thanh toán, **In bill** và **In phiếu pha chế** mở trang `/print/receipt?orderId=...` hoặc `/print/bar?orderId=...`; chọn **In ngay** để mở hộp in trình duyệt. Khổ giấy 58/80mm lấy từ cài đặt. In lại tại `/orders`. Biểu tượng dùng SVG `lucide-react` đóng gói cùng ứng dụng, không cần font biểu tượng/CDN.

Kiểm tra bán hàng bằng Playwright (Compose đang chạy, tài khoản demo, không có ca mở):

```sh
CHROME_PATH=$(command -v google-chrome) SCREENSHOT_DIR=/home/ubuntu/shots node tests/e2e/sales-check.mjs
```

Script đăng nhập PIN → mở ca → thêm 3 món có topping/ghi chú → tiền mặt → bill/phiếu pha chế → VietQR → đóng ca, đồng thời kiểm tra idempotency, validation, giảm giá và SVG. Lưu 5 ảnh yêu cầu cùng ảnh quản trị và đối soát. Giao dịch kiểm thử được giữ để in lại; ca kiểm thử được đóng, cài đặt khổ giấy được khôi phục. Thời gian chạm tự động không phải phép đo thao tác của nhân viên thực tế.
