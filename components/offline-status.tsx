'use client';
import { useEffect, useState, useRef } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { pendingState, refreshSnapshot, syncPending } from '@/lib/offline';
import { serverConnection } from '@/lib/server-connection';
export function OfflineStatus() {
  const [online, setOnline] = useState<boolean | null>(null),
    [pending, setPending] = useState(0),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const retry = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let active = true;
    const update = async () => {
      const state = await pendingState();
      if (active) {
        setPending(state.count);
        setError(state.error);
      }
    };
    let checking = false;
    const sync = async () => {
      if (checking) return;
      checking = true;
      try {
        const connection = await serverConnection();
        if (active) {
          setOnline(connection.online);
          setConnectionError(connection.error);
        }
        if (connection.online) await syncPending();
      } catch {
        if (active) {
          setOnline(false);
          setConnectionError(
            'Không thể đồng bộ với máy chủ. Đơn trên thiết bị vẫn được giữ.',
          );
        }
      } finally {
        await update();
        checking = false;
      }
    };
    retry.current = sync;
    const warm = async () => {
      try {
        const snapshot = await refreshSnapshot();
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.register('/sw.js');
          const registration = await navigator.serviceWorker.ready;
          const worker = registration.active;
          if (worker)
            await new Promise<void>((resolve, reject) => {
              const channel = new MessageChannel();
              const timer = setTimeout(
                () => reject(new Error('cache timeout')),
                30000,
              );
              channel.port1.onmessage = (e) => {
                clearTimeout(timer);
                if (e.data.ok) resolve();
                else reject(new Error('cache failed'));
              };
              worker.postMessage(
                {
                  type: 'CACHE_SESSION',
                  key: snapshot.user.id + '-' + snapshot.validUntil,
                },
                [channel.port2],
              );
            });
        }
        if (active) setReady(true);
        await sync();
      } catch {
        if (active) setReady(false);
      }
    };
    const changed = () => {
      void update();
    };
    const connected = () => {
      void sync();
      void warm();
    };
    const disconnected = () => {
      setOnline(false);
      setConnectionError('Thiết bị đang ngoại tuyến.');
    };
    void update();
    void sync();
    if (navigator.onLine) void warm();
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    window.addEventListener('cafe-offline-change', changed);
    const timer = setInterval(() => {
      void sync();
    }, 10000);
    const onSubmit = (event: SubmitEvent) => {
      if (
        event.target instanceof HTMLFormElement &&
        event.target.action.endsWith('/api/auth/logout')
      ) {
        navigator.serviceWorker?.controller?.postMessage({ type: 'LOGOUT' });
      }
    };
    document.addEventListener('submit', onSubmit);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('cafe-offline-change', changed);
      document.removeEventListener('submit', onSubmit);
    };
  }, []);
  return (
    <div className="max-w-full text-xs">
      <div
        data-testid="network-status"
        className={
          'flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 font-semibold ' +
          (online
            ? 'bg-emerald-50 text-emerald-900'
            : 'bg-amber-100 text-amber-950')
        }
      >
        {online ? <Wifi size={16} /> : <WifiOff size={16} />}{' '}
        {online === null
          ? 'Đang kiểm tra máy chủ'
          : online
            ? 'Trực tuyến'
            : 'Mất kết nối máy chủ / ngoại tuyến'}{' '}
        ·{' '}
        {pending > 0
          ? pending + ' đơn chờ đồng bộ'
          : online
            ? 'Đã đồng bộ'
            : 'Chưa kiểm tra đồng bộ'}
        {error && online && ' · Lỗi đồng bộ'}
        {pending > 0 && (
          <button
            aria-label="Đồng bộ ngay"
            onClick={() => void retry.current()}
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      {online && (
        <span data-testid="offline-ready" className="block pt-1 text-stone-500">
          {ready
            ? 'Sẵn sàng bán ngoại tuyến'
            : 'Đang chuẩn bị dữ liệu ngoại tuyến…'}
        </span>
      )}
      {(connectionError || error) && (
        <p role="alert" className="max-w-xs pt-1 text-red-800">
          {connectionError || error} Đơn chưa bị xóa; thử đồng bộ lại sau khi xử
          lý.
        </p>
      )}
    </div>
  );
}
