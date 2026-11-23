'use client';
import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { pendingState, refreshSnapshot, syncPending } from '@/lib/offline';
export function OfflineStatus() {
  const [online, setOnline] = useState(true),
    [pending, setPending] = useState(0),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const update = async () => {
      const state = await pendingState();
      if (active) {
        setOnline(navigator.onLine);
        setPending(state.count);
        setError(state.error);
      }
    };
    const sync = async () => {
      try {
        await syncPending();
      } catch {}
      await update();
    };
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
      void warm();
    };
    const disconnected = () => {
      setOnline(false);
    };
    void update();
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
        {online ? 'Trực tuyến' : 'Ngoại tuyến'} ·{' '}
        {pending > 0 ? pending + ' đơn chờ đồng bộ' : 'Đã đồng bộ'}
        {pending > 0 && online && (
          <button
            aria-label="Đồng bộ ngay"
            onClick={() => void syncPending().catch(() => {})}
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
      {error && (
        <p role="alert" className="max-w-xs pt-1 text-red-800">
          {error} Đơn chưa bị xóa; thử đồng bộ lại sau khi xử lý.
        </p>
      )}
    </div>
  );
}
