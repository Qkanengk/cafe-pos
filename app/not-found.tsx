export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-5 p-8">
      <h1 className="text-2xl font-bold">Không tìm thấy trang hoặc đơn hàng</h1>
      <p>
        Đơn có thể đã thanh toán, được gộp hoặc đường dẫn không còn đúng. Dùng
        Đơn hàng để tìm hóa đơn cũ và in lại.
      </p>
      <nav className="flex flex-wrap gap-4">
        <a className="underline" href="/orders">
          Tìm đơn hàng / hóa đơn
        </a>
        <a className="underline" href="/tables">
          Về sơ đồ bàn
        </a>
        <a className="underline" href="/pos">
          Tạo đơn mới
        </a>
      </nav>
    </main>
  );
}
