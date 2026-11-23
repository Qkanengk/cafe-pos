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

Bản in được kiểm tra trong trình duyệt, chưa thử máy in nhiệt thực tế. Thiết lập menu/nhân viên, mở/đóng ca, sửa đơn máy chủ và báo cáo cần kết nối đến máy chủ POS.

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
- Có thể đóng màn hình thanh toán, giữ đơn và tiếp tục sửa ở `/pos` hoặc `/orders`. Giỏ chưa giữ chỉ nằm trong bộ nhớ trình duyệt; đơn đã giữ nằm trên máy chủ và mở lại được sau khi tải lại trang.
- Sau thanh toán, **In bill** và **In phiếu pha chế** mở trang `/print/receipt?orderId=...` hoặc `/print/bar?orderId=...`; chọn **In ngay** để mở hộp in trình duyệt. Khổ giấy 58/80mm lấy từ cài đặt. In lại tại `/orders`. Biểu tượng dùng SVG `lucide-react` đóng gói cùng ứng dụng, không cần font biểu tượng/CDN.

Kiểm tra bán hàng bằng Playwright (Compose đang chạy, tài khoản demo, không có ca mở):

```sh
CHROME_PATH=$(command -v google-chrome) SCREENSHOT_DIR=/home/ubuntu/shots node tests/e2e/sales-check.mjs
```

Script đăng nhập PIN → mở ca → thêm 3 món có topping/ghi chú → tiền mặt → bill/phiếu pha chế → VietQR → đóng ca, đồng thời kiểm tra idempotency, validation, giảm giá và SVG. Lưu 5 ảnh yêu cầu cùng ảnh quản trị và đối soát. Giao dịch kiểm thử được giữ để in lại; ca kiểm thử được đóng, cài đặt khổ giấy được khôi phục. Thời gian chạm tự động không phải phép đo thao tác của nhân viên thực tế.

## Bàn & giữ đơn (giai đoạn 4)

- Dữ liệu mẫu mới có giá riêng cho từng món và size: cà phê đen S/M/L 20/25/30 nghìn, bạc xỉu từ 29 nghìn; bánh chỉ một size **Phần**. Thẻ món hiển thị **từ** giá thấp nhất khi các size khác giá. Seed thoát ngay nếu đã có cửa hàng, không sửa giá, tài khoản hay lịch sử của database hiện có. Form quản trị giữ nguyên loại một phần của bánh đã seed.
- `/tables`: nhóm bàn theo khu vực, trống/đang phục vụ và tổng các đơn mở. Chạm bàn trống để tạo đơn tại bàn; chạm bàn bận để tiếp tục. Khi tách thành nhiều bill cùng bàn, các bill có liên kết riêng dưới bàn.
- **Giữ đơn / Tạm tính** lưu OPEN mà chưa thu tiền. Mở lại từ bàn hoặc bộ lọc **Đang giữ** ở `/orders`. Có thể thêm món, tăng số lượng, sửa ghi chú/giảm giá; món đã lưu giữ nguyên snapshot giá. Giảm số lượng bằng tách đơn hoặc hủy món có PIN, không âm thầm xóa lịch sử.
- Mọi sửa đổi, chuyển bàn, tách/gộp/hủy đều gửi `Order.version`, kiểm tra trong transaction và tăng version. Thiết bị dùng bản cũ nhận **409** cùng thông báo tiếng Việt và liên kết **Tải lại đơn**. Thanh toán cũng kiểm tra phiên bản; retry đơn đã thanh toán vẫn idempotent.
- **Tách đơn** chọn món/số lượng sang UUID mới, giữ lại ít nhất một món ở đơn gốc. Snapshot topping/ghi chú được sao chép. Giảm giá thực tế được phân bổ theo tỷ lệ tạm tính, làm tròn VND một lần; hai đơn giữ nguyên tổng tiền. **Gộp đơn** chuyển món đang bán của đơn nguồn vào đơn hiện tại; cộng hai mức giảm thành giảm tiền. Đơn nguồn đóng ở trạng thái CANCELLED, audit phân biệt `MERGED_INTO` với hủy. **Chuyển bàn** chỉ nhận bàn trống; bàn bận dùng gộp đơn.
- **Hủy món / Hủy đơn** chỉ áp dụng đơn OPEN, yêu cầu lý do và PIN của OWNER đang hoạt động cùng cửa hàng. Lưu VOIDED/CANCELLED, lý do và ID chủ quán cho phép trong AuditLog, không lưu PIN. Hủy món cuối cùng tự đóng đơn. Đơn đã thu tiền không sửa/hủy trong giai đoạn này; chưa có luồng hoàn tiền.
- `/orders` hiển thị toàn bộ đơn của ca đang mở, lọc trạng thái, chi tiết snapshot/món hủy, tiếp tục đơn và in lại bill/phiếu pha chế. Sau khi đóng ca, danh sách ca hiện tại trống; liên kết in đã lưu vẫn dùng được.

Kiểm tra bàn/giữ đơn (Compose chạy, tài khoản demo và không có ca mở; script đọc AuditLog qua `docker compose exec db psql`):

```sh
CHROME_PATH=$(command -v google-chrome) node tests/e2e/tables-check.mjs
```

Để kiểm tra giá mẫu mới mà không đổi database hiện có, tạo database kiểm thử riêng trong cùng PostgreSQL rồi chạy image ứng dụng với `DATABASE_URL` trỏ đến database đó, cổng phụ 3001. Chạy script với `BASE_URL=http://localhost:3001 CHECK_DATABASE=cafe_phase4_check EXPECT_FRESH_PRICES=1`. Script giữ lại lịch sử giao dịch kiểm thử, đóng ca khi hoàn tất và lưu `tables.png`, `void-pin.png`, `orders.png`, `pos.png` cùng ảnh lỗi đồng thời vào `SCREENSHOT_DIR` (mặc định `/home/ubuntu/shots`).

## Ngoại tuyến & báo cáo (giai đoạn 5)

- PWA có manifest và icon PNG cục bộ, service worker tự viết. Cần **localhost hoặc HTTPS**; IP LAN qua HTTP không có bảo đảm service worker. Font hệ thống, không tải font/CDN.
- Đăng nhập, mở ca khi có mạng, vào POS, đợi **Sẵn sàng bán ngoại tuyến**. Dexie lưu menu/bảng giá có chữ ký, quán/ngân hàng, bàn, ca mở và hạn phiên. Service worker cache shell, `/pos`, `/tables`, menu JSON và asset Next.js; mất mạng vẫn tải lại trang, mở bàn trống và bán đơn mới.
- Tiền mặt và VietQR tạo PNG tại máy; chuyển khoản vẫn cần thu ngân xác nhận. Đơn dùng UUID và mã **TAM-xxxxxxxx**. Chỉ báo thành công sau khi IndexedDB lưu bền vững cả đơn và UUID thanh toán. Không xóa dữ liệu trình duyệt/gỡ ứng dụng khi còn đơn chờ.
- Reconnect và mỗi 10 giây gửi tối đa 20 đơn/lô đến `/api/sync`. Header có nút thử ngay. Server kiểm tra nhân viên/cửa hàng/ca, chữ ký bảng giá và tiền thối, rồi ghi nguyên tử từng đơn + snapshot + payment + audit. Một dòng lỗi không chặn dòng hợp lệ; lỗi hiện ở header, dữ liệu chờ không tự bị xóa.
- Replay cùng UUID đơn/thanh toán và nội dung trả lại mã đã cấp. Nội dung khác cùng UUID trả 409 cho dòng đó. Mã CF tăng tuần tự theo ngày thanh toán Việt Nam trong transaction. Banner đổi TAM thành CF sau sync; in lại ở Đơn hàng. Đơn giữ đúng ca đã cache, không chuyển sang ca mới.
- Phiên ngoại tuyến hết hạn cùng phiên đăng nhập (12 giờ); kết nối và đăng nhập lại để tiếp tục. Queue giữ theo nhân viên, chỉ sync dưới đúng tài khoản. Logout xóa cache service worker, không xóa giao dịch đang chờ trong IndexedDB. Không đăng nhập mới/chuyển nhân viên khi mất mạng.
- Đơn giữ ngoại tuyến ở URL UUID trên thiết bị đến khi thanh toán, không đẩy OPEN lên server. Sửa/gộp/tách/hủy đơn máy chủ cần mạng/PIN. Nếu thiết bị khác đóng ca trước thời điểm bán hoặc món/bàn đã bị xóa, sync giữ dòng lỗi để chủ quán kiểm tra thay vì âm thầm đổi ca/giá. Đơn bán trước lúc đóng ca vẫn sync muộn được, có thể thay đổi đối soát ca đã đóng.
- `/reports` và `/api/reports` OWNER-only. Mặc định hôm nay, tối đa 366 ngày, giờ Việt Nam; chỉ tính PAID đã sync. Có doanh thu ngày/ca/phương thức, số đơn, trung bình, top 10 số lượng/doanh thu. Doanh thu món gồm topping và phân bổ giảm giá nguyên VND. Món/đơn hủy có ca, lý do, OWNER cho phép từ audit; gộp bill không bị tính nhầm là hủy.
- Báo cáo theo ngày thanh toán; mục hủy theo thời điểm audit. Dùng snapshot, không thay bởi giá/tên hiện tại.

Kiểm tra production (Compose chạy, tài khoản demo, không có ca mở):

```sh
CHROME_PATH=$(command -v google-chrome) node tests/e2e/offline-check.mjs
```

Script bán 5 đơn tiền mặt offline, kiểm tra queue sau cold reload, bàn và VietQR offline; reconnect đối chiếu đúng 5 đơn/5 payment trong PostgreSQL, replay không trùng, đối chiếu báo cáo hôm nay với SQL. Giữ lịch sử thử, đóng ca thử. Ảnh trong `SCREENSHOT_DIR` (mặc định `/home/ubuntu/shots`): `offline-pending.png`, `synced.png`, `reports-phone.png` (390px).
