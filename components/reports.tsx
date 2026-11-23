import { formatVnd } from '@/lib/money';
import type { buildReport } from '@/lib/reports';
type Report = ReturnType<typeof buildReport>;
function Breakdown({
  title,
  rows,
  testid,
}: {
  title: string;
  rows: { id: string; label: string; revenue: number; count: number }[];
  testid: string;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {!rows.length ? (
        <p className="text-sm text-stone-500">Chưa có doanh thu.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => (
            <li
              data-testid={testid + '-' + r.id}
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="min-w-0 text-sm">
                {r.label}
                <small className="block text-stone-500">{r.count} đơn</small>
              </span>
              <strong className="text-emerald-900">
                {formatVnd(r.revenue)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export function Reports({ data }: { data: Report }) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
          Góc nhìn chủ quán
        </p>
        <h1 className="mt-2 text-3xl font-bold">Báo cáo</h1>
        <p className="mt-2 text-sm text-stone-500">
          Theo ngày thanh toán · giờ Việt Nam. Chỉ tính đơn đã thanh toán và đã
          đồng bộ.
        </p>
      </header>
      <form
        className="grid grid-cols-2 gap-3 rounded-2xl border border-stone-200 bg-white p-4"
        method="get"
      >
        <label className="min-w-0 text-sm">
          Từ ngày
          <input
            aria-label="Từ ngày"
            type="date"
            name="from"
            defaultValue={data.from}
            required
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-stone-200 px-2"
          />
        </label>
        <label className="min-w-0 text-sm">
          Đến ngày
          <input
            aria-label="Đến ngày"
            type="date"
            name="to"
            defaultValue={data.to}
            required
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-stone-200 px-2"
          />
        </label>
        <button className="col-span-2 min-h-12 rounded-xl bg-emerald-800 font-bold text-white">
          Xem báo cáo
        </button>
      </form>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Doanh thu', formatVnd(data.revenue), 'report-revenue'],
          ['Số đơn', String(data.count), 'report-count'],
          ['Trung bình / đơn', formatVnd(data.average), 'report-average'],
        ].map(([label, value, id]) => (
          <article
            key={id}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
          >
            <p className="text-sm text-emerald-900">{label}</p>
            <strong
              data-testid={id}
              className="mt-2 block text-2xl text-emerald-950"
            >
              {value}
            </strong>
          </article>
        ))}
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Breakdown
          title="Doanh thu theo ngày"
          rows={data.days}
          testid="report-day"
        />
        <Breakdown
          title="Theo phương thức"
          rows={data.methods}
          testid="report-method"
        />
        <div className="xl:col-span-2">
          <Breakdown
            title="Doanh thu theo ca"
            rows={data.shifts}
            testid="report-shift"
          />
        </div>
        {(
          [
            ['Top 10 · Số lượng', data.topQuantity],
            ['Top 10 · Doanh thu', data.topRevenue],
          ] as const
        ).map(([title, items]) => (
          <section
            key={title}
            className="rounded-2xl border border-stone-200 bg-white p-4"
          >
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-1 text-xs text-stone-500">
              Sau phân bổ giảm giá; gồm topping.
            </p>
            {!items.length ? (
              <p className="mt-4 text-sm text-stone-500">Chưa có món đã bán.</p>
            ) : (
              <ol className="mt-3 divide-y divide-stone-100">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 py-3 text-sm"
                  >
                    <span>
                      {index + 1}. {item.name}
                      <small className="block text-stone-500">
                        {item.quantity} món
                      </small>
                    </span>
                    <strong className="shrink-0">
                      {formatVnd(item.revenue)}
                    </strong>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-bold">Món / đơn hủy theo ca</h2>
        <p className="mt-1 text-xs text-stone-500">
          Theo thời điểm hủy trong khoảng ngày; không tính bill nguồn đã gộp.
        </p>
        {!data.voids.length ? (
          <p className="mt-4 text-sm text-stone-500">Không có món hủy.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.voids.map((row) => (
              <li
                key={row.id}
                className="rounded-xl bg-red-50 p-3 text-sm text-red-950"
              >
                <strong>
                  {row.quantity} × {row.item}
                </strong>
                <p>
                  {row.action === 'CANCEL' ? 'Hủy đơn' : 'Hủy món'} · {row.code}{' '}
                  · {formatVnd(row.amount)}
                </p>
                <p>Ca: {row.shift}</p>
                <p>Lý do: {row.reason}</p>
                <p>
                  Chủ quán cho phép: <strong>{row.owner}</strong>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
