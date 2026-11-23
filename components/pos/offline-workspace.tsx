'use client';
import { useEffect, useState } from 'react';
import { cachedSnapshot, localDraft } from '@/lib/offline';
import type { OfflineSnapshot } from '@/lib/offline-types';
import type { SaleOrder } from '@/lib/sales-types';
import { Terminal } from './terminal';
import { Tables } from './tables';
export function OfflineWorkspace() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null),
    [initial, setInitial] = useState<SaleOrder | undefined>(),
    [error, setError] = useState(''),
    [path, setPath] = useState(''),
    [tableId, setTableId] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await cachedSnapshot();
        const params = new URLSearchParams(location.search);
        const orderId = params.get('orderId');
        const draft = orderId ? await localDraft(orderId) : undefined;
        if (orderId && !draft)
          throw new Error(
            'Không tìm thấy đơn trên thiết bị này. Kết nối để kiểm tra đơn máy chủ hoặc trở lại /pos để tạo đơn mới.',
          );
        if (active) {
          setSnapshot(data);
          setInitial(draft?.order);
          setTableId(params.get('tableId') ?? undefined);
          setPath(location.pathname);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : 'Không thể mở dữ liệu đã lưu',
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <p role="alert">
        {error}{' '}
        <a className="underline" href="/pos">
          Tạo đơn mới
        </a>
      </p>
    );
  if (!snapshot) return <p>Đang mở dữ liệu trên thiết bị…</p>;
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
        Dùng thực đơn và ca đã lưu. Mã TAM là mã tạm; mã bill chính thức được
        cấp sau đồng bộ. Đơn giữ ngoại tuyến ở trên thiết bị đến khi thanh toán.
        Sửa/gộp/hủy đơn máy chủ cần có mạng.
      </p>
      {path === '/tables' ? (
        <Tables tables={snapshot.tables} />
      ) : (
        <Terminal
          products={snapshot.products}
          categories={snapshot.categories}
          toppings={snapshot.toppings}
          tables={snapshot.tables}
          bank={snapshot.store}
          hasShift={!!snapshot.shift}
          initialTableId={tableId}
          initialOrder={initial}
          offlineMode
        />
      )}
    </div>
  );
}
