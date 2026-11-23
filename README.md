# Cafe POS · Quầy bán hàng tiếng Việt

POS cho **một quán cafe, 1–10 nhân viên**, dùng trên tablet ngang và điện thoại của chủ quán. Chạy cục bộ bằng Docker Compose, không cần cloud, CDN, API ngân hàng hay font từ Internet lúc bán hàng.

## Chạy nhanh bằng Docker

Yêu cầu: Docker Engine/Desktop và Docker Compose v2; cổng 3000 còn trống.

```sh
git clone https://github.com/Qkanengk/cafe-pos.git
cd cafe-pos
git switch devin/cafe-pos-mvp
docker compose up -d --build
```

Mở **http://localhost:3000** (tự chuyển tới đăng nhập), hoặc http://localhost:3000/pos. App chờ PostgreSQL healthy, chạy migration, seed nếu chưa có cửa hàng, rồi khởi động. Đợi log `Ready` trước khi đăng nhập:

```sh
docker compose ps
docker compose logs -f app
```

| Tài khoản demo | Email / mật khẩu                | Đăng nhập PIN                         |
| -------------- | ------------------------------- | ------------------------------------- |
| Chủ quán       | `owner@cafe.local` / `owner123` | PIN **1111** chỉ để duyệt hủy món/đơn |
| Thu ngân       | —                               | Chọn **Lan**, PIN **2222**            |

Mở ca trước khi bán. Seed có 20 món, 4 danh mục, 5 topping, 8 bàn: cà phê đen S/M/L 20/25/30 nghìn, bạc xỉu từ 29 nghìn, bánh một size **Phần**. Thẻ món hiện giá thấp nhất và **từ** nếu các size khác giá. Seed lại **không sửa dữ liệu cửa hàng đã tồn tại**.

### Docker Hub mặc định; mirror chỉ là tùy chọn

Dockerfile mặc định `ARG NODE_IMAGE=node:22-bookworm-slim` (Docker Hub), PostgreSQL `postgres:16-alpine`. Không có mirror bắt buộc. Nếu registry bị giới hạn 429, có thể truyền image Node tương đương chỉ cho build:

```sh
NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim docker compose up -d --build
```

Build trực tiếp cũng hỗ trợ `docker build --build-arg NODE_IMAGE=node:22-bookworm-slim -t cafe-pos-app .`. Không đặt mirror trong mã nguồn mặc định; build cần Internet để tải image/npm, còn bán hàng không cần dịch vụ Internet ngoài.

### Xóa dữ liệu và tạo lại demo

**Lệnh sau xóa toàn bộ doanh số, ca, nhân viên và menu trong volume! Chỉ dùng cho demo/test; đồng bộ hết queue trên mọi thiết bị trước khi reset.**

```sh
docker compose down -v
docker compose up -d --build
```

Dữ liệu PostgreSQL nằm trong named volume `cafe_data` (Compose thêm tiền tố tên project). `docker compose down` không có `-v` giữ nguyên dữ liệu. Sau reset, đăng nhập lại và tải POS khi có mạng để thay cache cũ. Không có đơn/ca giao dịch trong seed.

## Tính năng

- **Đăng nhập/phân quyền:** chủ quán dùng email/mật khẩu; thu ngân chọn tên + PIN. PIN chủ quán chỉ dùng để duyệt hủy, không đăng nhập. PIN giới hạn 5 lần thử/tài khoản và 20 lần/IP trong 15 phút (bộ nhớ một container); triển khai sau proxy cần cấu hình proxy ghi đè header IP. JWT cookie HttpOnly/SameSite=Lax, phiên 12 giờ, Secure khi HTTPS. Kiểm tra nhân viên còn hoạt động trong database. `/admin/*`, `/reports` và API tương ứng OWNER-only.
- **Ca:** mở ca với tiền đầu ca, đóng ca với tiền thực đếm/chênh lệch; dự kiến = tiền đầu ca + tiền khách đưa − tiền thối, không cộng chuyển khoản. Còn đơn OPEN thì không đóng ca.
- **POS:** danh mục/tìm kiếm, trạng thái hết hàng, size/topping/ghi chú nhanh, số lượng, mang đi/tại bàn, giảm %/tiền, tiền thối và gợi ý mệnh giá. VND số nguyên, toàn bộ tính giá ở `lib/money.ts`.
- **Thanh toán:** tiền mặt hoặc VietQR NAPAS/EMVCo tạo PNG tại máy; thu ngân xác nhận tiền về thủ công, có ghi người xác nhận. UUID chống tạo đơn/thu tiền trùng; snapshot giữ tên/giá/topping/ghi chú lịch sử.
- **In:** bill và phiếu pha chế 58/80mm, hộp in trình duyệt, in lại đơn PAID. Chưa kiểm tra máy in nhiệt vật lý.
- **Bàn/đơn:** sơ đồ theo khu vực và tổng đang phục vụ; giữ OPEN, mở lại, thêm món, tách số lượng, gộp bill, chuyển bàn. Phân bổ giảm giá nguyên VND khi tách; gộp giữ tổng mức giảm.
- **Xung đột/hủy:** `Order.version` cũ trả 409 và thông báo tải lại. Hủy món/đơn OPEN phải có lý do + PIN OWNER đang hoạt động; giữ VOIDED/CANCELLED và audit, không ghi PIN. Chưa hoàn tiền/hủy đơn PAID. Bill nguồn đã gộp phân biệt với hủy trong audit.
- **Quản trị:** CRUD danh mục/món/topping/thứ tự/giá S/M/L hoặc Phần, bật/tắt bán một chạm; tải ảnh cục bộ hoặc URL ảnh công khai; nhân viên/PIN/vai trò/ngừng hoạt động; quán/ngân hàng/BIN/footer/khổ giấy. Validation Zod dùng chung, thay đổi có audit.
- **Ảnh món:** PNG/JPEG/GIF/WebP tối đa 2 MB, kiểm tra MIME và chữ ký tệp; không SVG. Ảnh tải lên nằm trong volume Docker `cafe_uploads`, cần sao lưu cùng dữ liệu. `UPLOAD_DIR` đổi thư mục lưu (mặc định `./uploads`, Compose dùng `/app/uploads`). URL phải trỏ trực tiếp tới ảnh công khai; địa chỉ nội bộ/localhost, chuyển hướng và nội dung không phải ảnh bị từ chối để tránh truy cập dịch vụ nội bộ. Ảnh nội bộ dùng nút tải từ thiết bị.
- **Nhật ký:** `/admin/audit` chỉ dành cho chủ quán, lọc thao tác/khoảng ngày, có phân trang và chi tiết đã loại thông tin PIN/mật khẩu; giảm giá được ghi khi đơn thanh toán, gồm cả đơn ngoại tuyến đã đồng bộ.
- **Báo cáo điện thoại:** khoảng ngày (hôm nay mặc định, tối đa 366 ngày), doanh thu ngày/ca/phương thức, số đơn/trung bình, top 10 số lượng/doanh thu, món/đơn hủy theo ca với lý do và chủ quán cho phép.

## Ngoại tuyến: chuẩn bị và giới hạn

1. Service worker/PWA cần **localhost hoặc HTTPS**. HTTP qua IP LAN không đủ secure context; triển khai tablet trong LAN cần TLS tin cậy. HTTPS/reverse proxy không được cấu hình sẵn trong Compose demo.
2. Khi có mạng: đăng nhập, mở ca, vào POS và đợi **Sẵn sàng bán ngoại tuyến**. Cache shell/POS/bàn/asset/menu; font hệ thống và icon SVG/PNG cục bộ. Dexie giữ menu có chữ ký, quán/ngân hàng, ca và thời hạn phiên.
3. Mất mạng vẫn tạo đơn mới mang đi/tại bàn, trả tiền mặt hoặc xem VietQR/xác nhận thủ công. Chỉ báo thành công sau khi IndexedDB lưu bền vững đơn + UUID payment. Mã **TAM-xxxxxxxx** tạm thời, header hiện số đơn chờ.
4. Reconnect và mỗi 10 giây gửi queue đến `/api/sync`; nút đồng bộ cho thử ngay. Ghi nguyên tử từng đơn/payment/audit, replay không trùng; chỉ xóa queue khi server xác nhận. Lỗi hiện ở header và được giữ để thử lại, không âm thầm bỏ đơn.
5. Server cấp mã CF tăng tuần tự theo ngày thanh toán Việt Nam. Mã khi giữ đơn là mã tạm dùng tại quầy; nếu qua ngày mới trước khi trả tiền, thanh toán trực tuyến và đồng bộ đều cấp lại mã theo ngày trả tiền (giữ nguyên UUID). Banner đổi TAM thành CF và có liên kết in sau sync; giữ ca gốc, snapshot giá đã ký và người xác nhận. Ngày báo cáo theo thời điểm thanh toán; mục hủy theo audit. Chỉ tính doanh thu PAID đã sync.
6. Phiên offline hết hạn cùng phiên đăng nhập 12 giờ. Cần mạng để đăng nhập mới/chuyển nhân viên, mở/đóng ca, quản trị, sửa/gộp/tách/hủy đơn máy chủ và xem báo cáo. Đơn giữ offline ở URL UUID trên thiết bị đến lúc trả tiền, không đẩy OPEN lên server.
7. Đơn bán trước khi đóng ca có thể sync muộn (đối soát ca đã đóng có thể đổi). Nếu ca đóng trước thời điểm bán, hoặc món/bàn đã xóa, queue giữ lỗi để chủ quán kiểm tra thay vì đổi ca/giá. Queue theo đúng tài khoản nhân viên; logout không xóa giao dịch chờ.
8. Không xóa dữ liệu trình duyệt, dùng chế độ riêng tư, gỡ PWA hoặc reset database khi còn đơn chờ. Mất thiết bị/storage cũng mất queue chưa sync; đây không phải bản sao lưu server.

## Phát triển (Node 22)

Dùng npm và PostgreSQL 16. Có thể giữ stack demo cổng 3000 và chạy dev cổng 3002 với database riêng:

```sh
source ~/.nvm/nvm.sh    # nếu dùng nvm
nvm use 22
npm ci
cp .env.example .env
# PostgreSQL dev độc lập, chỉ mở cổng trên loopback:
docker run --name cafe-pos-dev-db --rm -d -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=cafe -e POSTGRES_PASSWORD=cafe -e POSTGRES_DB=cafe postgres:16-alpine
set -a
. ./.env
set +a
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev -- --port 3002
```

Compose mặc định không public cổng database; hostname `db` chỉ dành cho app trong Docker. Không dùng database thật cho test. App Router Next.js 16 dùng `proxy.ts`, không phải `middleware.ts`.

## Biến môi trường

Giới hạn PIN bỏ qua header IP do trình duyệt gửi khi chạy trực tiếp. Khi Next.js App Router không cung cấp socket IP, chỉ khóa theo tài khoản; không dùng nhóm IP chung. Phép so sánh giả cho tài khoản không hợp lệ có ngân sách CPU riêng, không khóa nhân viên hợp lệ. Đăng nhập và PIN duyệt hủy dùng bộ giới hạn tách biệt. Chỉ đặt `TRUST_PROXY=true` sau reverse proxy tin cậy đã ghi đè `X-Forwarded-For` và chặn truy cập trực tiếp tới app; khi đó dùng IP do proxy cung cấp. Không bật tùy chọn này trên cổng mở trực tiếp.

| Biến               | Ý nghĩa                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | Prisma/pg; Compose đặt `postgresql://cafe:cafe@db:5432/cafe?schema=public`. Dev/CI dùng host/port truy cập được từ Node. CLI Prisma cần export biến; `.env.example` có ví dụ loopback.                    |
| `AUTH_SECRET`      | Ít nhất 32 ký tự, ký JWT và bảng giá offline. Compose có giá trị demo; **đổi secret, mật khẩu database và tài khoản mẫu trước khi triển khai thật**. Đổi secret làm token/menu cache cũ không còn hợp lệ. |
| `NODE_IMAGE`       | Build arg qua Compose; mặc định Docker Hub `node:22-bookworm-slim`, mirror chỉ khi tự chọn.                                                                                                               |
| `HOSTNAME`, `PORT` | Server standalone; container dùng `0.0.0.0:3000`.                                                                                                                                                         |
| `BASE_URL`         | E2E, mặc định `http://localhost:3000`. Phải là cùng app/database đang kiểm thử.                                                                                                                           |
| `CHROME_PATH`      | Tùy chọn đường dẫn Chrome E2E; nếu trống dùng Chromium đã cài bằng Playwright.                                                                                                                            |
| `CHECK_DATABASE`   | Tên database khi E2E dùng `docker compose exec db psql`, mặc định `cafe`. Không cần khi đã export `DATABASE_URL`.                                                                                         |

## Kiểm thử

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
```

### Suite E2E chính thức

**Chỉ chạy trên DB demo mới seed, không có đơn/ca.** Suite kiểm tra điều kiện này trước khi thay đổi dữ liệu; không tự xóa database. Các ca chạy tuần tự, không retry để tránh che lỗi dữ liệu. Suite tái dùng script kiểm chứng dưới `tests/e2e/`, có 4 test:

1. Quản trị CRUD, chặn thu ngân, responsive.
2. PIN → mở ca → order 3 món/topping/ghi chú → tiền mặt/VietQR → bill/phiếu pha chế → đóng ca.
3. Giữ/mở lại đơn tại bàn, tách/gộp/chuyển, PIN sai/đúng, audit và hai trình duyệt sửa cùng phiên bản.
4. Offline 5 đơn tiền mặt, cold reload/bàn/QR, lỗi sync 503 giữ queue, reconnect/replay không trùng, đóng ca và báo cáo OWNER so với SQL hôm nay.

```sh
npm ci
npx playwright install --with-deps chromium
docker compose down -v             # XÓA DB demo/test, không dùng với dữ liệu thật
docker compose up -d --build
npm run test:e2e
# Đọc báo cáo HTML/ảnh chụp:
npx playwright show-report
# Sau test, trả demo về sạch:
docker compose down -v
docker compose up -d --build
```

Khi không export `DATABASE_URL`, helper SQL dùng PostgreSQL trong Compose (không cần mở port). Khi export biến này, helper dùng `pg` trực tiếp như CI, không cần Docker CLI. Đừng để `DATABASE_URL` trỏ nhầm DB khác với `BASE_URL`. Nếu chỉ có Chrome hệ thống: `CHROME_PATH=$(command -v google-chrome) npm run test:e2e`.

Suite giữ lại lịch sử test cho kiểm tra, nên cần reset trước lần chạy tiếp theo và trước demo. Output, ảnh chụp từng ca ở `test-results/`, báo cáo ở `playwright-report/`; cả hai bị gitignore. Các script `.mjs` cũng chạy riêng được, nhưng không thay thế preflight fresh DB của suite.

### CI

`.github/workflows/ci.yml`: Node 22 + PostgreSQL service mới cho mỗi job, npm ci → Prisma generate → lint → typecheck → unit → production build → migrate/seed → cài Playwright Chromium → standalone server → E2E. Artifact giữ báo cáo/ảnh/log kể cả khi lỗi. Không phụ thuộc Docker Compose hay Chrome hệ thống khi chạy E2E trong Actions.

Có thể kiểm tra cú pháp/ngữ nghĩa workflow với `actionlint .github/workflows/ci.yml`. Actions thực tế chạy khi push/PR; actionlint không thay thế việc chạy CI.

## Cấu trúc

```text
app/(auth)/             Đăng nhập
app/(pos)/              POS, bàn, đơn, ca, workspace offline
app/(admin)/            Menu, nhân viên, cài đặt, báo cáo
app/api/                Auth, admin, bán hàng, menu cache, sync, reports
app/print/              Bill và phiếu pha chế
components/             UI, POS, admin, báo cáo, trạng thái mạng
lib/                    Auth/session, Zod, VND/VietQR, sync/offline, báo cáo
prisma/                 Schema, migrations, menu mẫu và seed
public/                 Service worker, manifest, icon PWA cục bộ
tests/unit/             Vitest: giá/tiền/auth/validation/bán hàng/sync/báo cáo
tests/e2e/              Playwright runner + các luồng kiểm chứng và helper DB
.github/workflows/      CI
Dockerfile              Multi-stage, standalone, user node
docker-compose.yml      App + PostgreSQL, named volume và healthcheck
```

## Ngoài phạm vi / bước tiếp theo

Chưa có đa chi nhánh, tồn kho/nguyên liệu, khách hàng thân thiết/voucher, VAT/kế toán/hóa đơn điện tử, Grab/ShopeeFood, chấm công, app native, webhook xác nhận ngân hàng, hoàn tiền đơn PAID, xuất Excel hay agent ESC/POS/WebUSB. Chưa chạy thử thực tế một ngày tại quán hoặc máy in nhiệt vật lý.

Trước dùng thật: đổi thông tin demo/secret, cấu hình HTTPS trong LAN, backup/khôi phục PostgreSQL có kiểm chứng, bảo vệ máy POS, theo dõi queue lỗi, thử mất mạng trên thiết bị thực và kiểm tra máy in. Sau đó mới mở rộng kho/khách hàng/webhook/đa chi nhánh.
