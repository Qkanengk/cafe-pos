'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function LoginForm({
  users,
}: {
  users: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...Object.fromEntries(form) }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error);
        return;
      }
      router.push('/pos');
      router.refresh();
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-6 flex gap-2" aria-label="Cách đăng nhập">
        <Button
          type="button"
          className={mode === 'pin' ? '' : 'bg-stone-500'}
          onClick={() => {
            setMode('pin');
            setError('');
          }}
        >
          Nhân viên
        </Button>
        <Button
          type="button"
          className={mode === 'password' ? '' : 'bg-stone-500'}
          onClick={() => {
            setMode('password');
            setError('');
          }}
        >
          Chủ quán
        </Button>
      </div>
      <form onSubmit={submit} className="space-y-5" key={mode}>
        {mode === 'pin' ? (
          <>
            <label className="block space-y-2">
              <span>Tên nhân viên</span>
              <select
                name="userId"
                required
                className="min-h-12 w-full rounded-xl border border-stone-300 px-3"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span>Mã PIN</span>
              <Input
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                required
                autoComplete="current-password"
                placeholder="Nhập 4–6 chữ số"
              />
            </label>
          </>
        ) : (
          <>
            <label className="block space-y-2">
              <span>Email chủ quán</span>
              <Input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </label>
            <label className="block space-y-2">
              <span>Mật khẩu</span>
              <Input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={busy || !users.length}>
          {busy ? (
            'Đang đăng nhập…'
          ) : (
            <>
              Đăng nhập{' '}
              <ArrowRight size={20} className="ml-2" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
    </>
  );
}
