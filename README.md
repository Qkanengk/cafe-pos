# Cafe POS

Ứng dụng POS một quán, tiếng Việt. Giai đoạn 1: nền tảng, dữ liệu mẫu, đăng nhập và các trang giữ chỗ; chưa có luồng bán hàng/thanh toán.

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

Các route in `/print/receipt`, `/print/bar` hiện là giữ chỗ. Offline, đồng bộ, in thực tế, quản lý menu, báo cáo và E2E luồng bán hàng thuộc các giai đoạn sau. Dexie và Playwright đã được cài để phát triển các phần đó.

Tính tiền chỉ ở `lib/money.ts`: VND nguyên không âm, phần trăm nguyên 0–100, làm tròn nửa lên, giảm tiền tối đa bằng tạm tính, thiếu tiền mặt báo lỗi. VietQR tạo payload NAPAS + CRC16-CCITT-FALSE và PNG tại máy, không gọi API ngân hàng.
POS (point of sale) cho các quán cafe nhỏ lẻ
