'use client';
import { useState, type InputHTMLAttributes } from 'react';
import { Input } from './input';
import { parseVndInput, normalizeVndEditing } from '@/lib/money';
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  grouped?: boolean;
};
export function MoneyInput({
  value,
  onValueChange,
  grouped = true,
  ...props
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const amount = parseVndInput(value);
  const display =
    String(value) !== '' && Number.isFinite(amount) && grouped
      ? new Intl.NumberFormat('vi-VN').format(amount)
      : String(value);
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={editing ?? display}
      aria-invalid={String(value) !== '' && !Number.isFinite(amount)}
      onFocus={(event) => setEditing(event.currentTarget.value)}
      onBlur={() => setEditing(null)}
      onChange={(event) => {
        setEditing(event.target.value);
        onValueChange(normalizeVndEditing(event.target.value));
      }}
    />
  );
}
