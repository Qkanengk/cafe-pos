'use client';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowRight, Delete } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const subscribeToHydration = () => () => {};
export function LoginForm({
  users,
}: {
  users: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [selectedUser, setSelectedUser] = useState(users[0]?.id ?? '');
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
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
      <div className="login-methods" aria-label="Cách đăng nhập">
        <Button
          type="button"
          aria-pressed={mode === 'pin'}
          disabled={!interactive || busy}
          onClick={() => {
            setMode('pin');
            setError('');
            setPin('');
          }}
        >
          Nhân viên
        </Button>
        <Button
          type="button"
          aria-pressed={mode === 'password'}
          disabled={!interactive || busy}
          onClick={() => {
            setMode('password');
            setError('');
            setPin('');
          }}
        >
          Chủ quán
        </Button>
      </div>
      <form onSubmit={submit} className="login-form space-y-3" key={mode}>
        {mode === 'pin' ? (
          <>
            <label className="block space-y-2">
              <span>Tên nhân viên</span>
              <select
                name="userId"
                required
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
                disabled={!interactive || busy}
                className="min-h-10 w-full rounded-md border border-stone-300 px-3"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="staff-shortcuts">
              {users.slice(0, 4).map((user) => (
                <button
                  key={user.id}
                  type="button"
                  aria-label={'Chọn nhân viên ' + user.name}
                  aria-pressed={selectedUser === user.id}
                  disabled={!interactive || busy}
                  onClick={() => setSelectedUser(user.id)}
                >
                  {user.name}
                </button>
              ))}
            </div>
            <label className="block space-y-2">
              <span>Mã PIN</span>
              <Input
                name="pin"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={!interactive || busy}
                className="h-12 text-center text-xl tracking-[.3em]"
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
            <div className="login-keypad">
              {[
                '1',
                '2',
                '3',
                '4',
                '5',
                '6',
                '7',
                '8',
                '9',
                'clear',
                '0',
                'delete',
              ].map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={
                    key === 'clear'
                      ? 'Xóa PIN'
                      : key === 'delete'
                        ? 'Xóa chữ số PIN cuối'
                        : key
                  }
                  disabled={!interactive || busy}
                  onClick={() =>
                    setPin((current) =>
                      key === 'clear'
                        ? ''
                        : key === 'delete'
                          ? current.slice(0, -1)
                          : (current + key).slice(0, 6),
                    )
                  }
                >
                  {key === 'clear' ? (
                    'C'
                  ) : key === 'delete' ? (
                    <Delete size={21} aria-hidden="true" />
                  ) : (
                    key
                  )}
                </button>
              ))}
            </div>
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
        <Button
          className="min-h-11 w-full"
          disabled={busy || !users.length || !interactive}
        >
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
