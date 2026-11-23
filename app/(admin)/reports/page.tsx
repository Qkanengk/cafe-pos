import { requireUser } from '@/lib/auth';
import { loadReport } from '@/lib/report-query';
import { Reports } from '@/components/reports';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser('OWNER');
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof loadReport>> | null = null;
  try {
    data = await loadReport(user.storeId, params.from, params.to);
  } catch {}
  if (!data) {
    return (
      <p role="alert">
        Khoảng ngày không hợp lệ hoặc chưa thể tải báo cáo. Chọn tối đa 366
        ngày.{' '}
        <a href="/reports" className="underline">
          Xem hôm nay
        </a>
      </p>
    );
  }
  return <Reports data={data} />;
}
