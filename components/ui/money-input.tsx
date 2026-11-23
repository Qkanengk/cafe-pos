'use client';
import {
  useState,
  useId,
  useSyncExternalStore,
  type InputHTMLAttributes,
} from 'react';
import { Input } from './input';
import {
  parseVndInput,
  parsePercentInput,
  normalizeVndEditing,
} from '@/lib/money';
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  grouped?: boolean;
};
const subscribeToHydration = () => () => {};
export function MoneyInput({
  value,
  onValueChange,
  grouped = true,
  ...props
}: Props) {
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [editing, setEditing] = useState<{
    text: string;
    source: string;
  } | null>(null);
  const errorId = useId();
  const amount = grouped ? parseVndInput(value) : parsePercentInput(value);
  const invalid = String(value) !== '' && !Number.isFinite(amount);
  const message = grouped
    ? 'Nhập số tiền nguyên (ví dụ 50.000, 50,000 hoặc 50000); không nhập số thập phân.'
    : 'Nhập phần trăm nguyên từ 0 đến 100; không dùng dấu chấm hoặc phẩy.';
  const display =
    String(value) !== '' && Number.isFinite(amount) && grouped
      ? new Intl.NumberFormat('vi-VN').format(amount)
      : String(value);
  return (
    <>
      <Input
        {...props}
        disabled={props.disabled || !interactive}
        type="text"
        inputMode="numeric"
        value={editing?.source === String(value) ? editing.text : display}
        aria-invalid={invalid}
        aria-describedby={
          [props['aria-describedby'], invalid ? errorId : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        onFocus={(event) =>
          setEditing({ text: event.currentTarget.value, source: String(value) })
        }
        onBlur={() => setEditing(null)}
        onChange={(event) => {
          const deleting =
            !!(event.nativeEvent as InputEvent).inputType?.startsWith(
              'delete',
            ) && Number.isFinite(amount);
          const next = grouped
            ? normalizeVndEditing(event.target.value, deleting)
            : event.target.value;
          setEditing({ text: event.target.value, source: next });
          onValueChange(next);
        }}
      />
      {invalid && (
        <span
          id={errorId}
          role="alert"
          className="col-span-full block text-xs text-red-700"
        >
          {message}
        </span>
      )}
    </>
  );
}
