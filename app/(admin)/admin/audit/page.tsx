import { requireUser } from '@/lib/auth';
import { loadAudit } from '@/lib/audit';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    action?: string;
    page?: string;
  }>;
}) {
  const actor = await requireUser('OWNER');
  let result: Awaited<ReturnType<typeof loadAudit>> | undefined,
    error = '';
  try {
    result = await loadAudit(actor, await searchParams);
  } catch {
    error =
      'Không thể mở nhật ký. Hãy chọn ngày hợp lệ (tối đa 366 ngày) và thử lại.';
  }
  if (!result)
    return (
      <p role="alert">
        {error} <a href="/admin/audit">Xem hôm nay</a>
      </p>
    );
  const href = (page: number) =>
    '/admin/audit?' +
    new URLSearchParams({
      from: result.from,
      to: result.to,
      action: result.action,
      page: String(page),
    });
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Nhật ký hoạt động</h1>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-2">
          Từ ngày
          <input
            className="min-h-12 rounded-xl border p-3"
            type="date"
            name="from"
            defaultValue={result.from}
            required
          />
        </label>
        <label className="grid gap-2">
          Đến ngày
          <input
            className="min-h-12 rounded-xl border p-3"
            type="date"
            name="to"
            defaultValue={result.to}
            required
          />
        </label>
        <label className="grid gap-2">
          Thao tác
          <select
            className="min-h-12 rounded-xl border p-3"
            name="action"
            defaultValue={result.action}
          >
            <option value="">Tất cả</option>
            {result.actions.map((action) => (
              <option key={action}>{action}</option>
            ))}
          </select>
        </label>
        <button className="min-h-12 rounded-xl bg-emerald-800 px-5 text-white">
          Lọc nhật ký
        </button>
      </form>
      {result.entries.length === 0 && (
        <p>Không có hoạt động trong khoảng này.</p>
      )}
      {result.entries.map((entry) => (
        <article
          key={entry.id}
          className="space-y-2 rounded-xl border bg-white p-4"
        >
          <p>
            {entry.createdAt.toLocaleString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
            })}{' '}
            · <strong>{entry.user.name}</strong>
          </p>
          <p>
            {entry.action} · {entry.entity} · {entry.entityId}
          </p>
          <details>
            <summary className="cursor-pointer py-2">Chi tiết</summary>
            <pre className="whitespace-pre-wrap break-all rounded-lg bg-stone-50 p-3 text-sm">
              {JSON.stringify(entry.data, null, 2)}
            </pre>
          </details>
        </article>
      ))}
      <nav className="flex gap-5">
        {result.page > 1 && <a href={href(result.page - 1)}>Trang trước</a>}
        <span>Trang {result.page}</span>
        {result.hasMore && <a href={href(result.page + 1)}>Trang sau</a>}
      </nav>
    </div>
  );
}
