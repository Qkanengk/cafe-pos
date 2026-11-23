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
    <section className="report-panel">
      <h2>{title}</h2>
      {!rows.length ? (
        <p className="text-sm text-stone-500">Chưa có doanh thu.</p>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">Nhóm</th>
              <th scope="col">Số đơn</th>
              <th scope="col">Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr data-testid={testid + '-' + r.id} key={r.id}>
                <td>{r.label}</td>
                <td>{r.count}</td>
                <td className="font-semibold">{formatVnd(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
export function Reports({ data }: { data: Report }) {
  return (
    <div className="reports-workspace space-y-4">
      <header>
        <h1>Báo cáo</h1>
        <p className="mt-1 text-xs text-stone-500">
          Theo ngày thanh toán · giờ Việt Nam. Chỉ tính đơn đã thanh toán và đã
          đồng bộ.
        </p>
      </header>
      <form className="report-filters" method="get">
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
        <button className="min-h-10 rounded-md bg-emerald-800 px-5 text-sm font-semibold text-white">
          Xem báo cáo
        </button>
      </form>
      <section className="kpi-strip">
        {[
          ['Doanh thu', formatVnd(data.revenue), 'report-revenue'],
          ['Số đơn', String(data.count), 'report-count'],
          ['Trung bình / đơn', formatVnd(data.average), 'report-average'],
          [
            'Tiền mặt',
            formatVnd(
              data.methods.find((method) => method.id === 'CASH')?.revenue ?? 0,
            ),
            'report-cash',
          ],
        ].map(([label, value, id]) => (
          <article key={id} className="p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <strong
              data-testid={id}
              className="mt-2 block text-xl font-semibold"
            >
              {value}
            </strong>
          </article>
        ))}
      </section>
      {data.days.length > 1 && (
        <section className="report-panel">
          <h2>Doanh thu theo ngày</h2>
          <div
            className="revenue-chart"
            role="img"
            aria-label={data.days
              .map((day) => day.label + ': ' + formatVnd(day.revenue))
              .join('; ')}
          >
            {data.days.map((day, index) => (
              <div
                key={day.id}
                className="chart-column"
                title={day.label + ': ' + formatVnd(day.revenue)}
              >
                <div
                  style={{
                    height: Math.max(
                      0,
                      (120 * day.revenue) /
                        Math.max(1, ...data.days.map((row) => row.revenue)),
                    ),
                  }}
                />
                <span>
                  {index % Math.ceil(data.days.length / 7) === 0
                    ? day.id.slice(5).split('-').reverse().join('/')
                    : ' '}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
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
          <section key={title} className="report-panel">
            <h2>{title}</h2>
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
      <section className="report-panel">
        <h2>Món / đơn hủy theo ca</h2>
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
