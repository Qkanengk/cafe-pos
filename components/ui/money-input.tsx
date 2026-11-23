'use client';
import { useState, type InputHTMLAttributes } from 'react';
import { flushSync } from 'react-dom';
import { Input } from './input';
import { parseVndInput } from '@/lib/money';
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
  const [focused, setFocused] = useState(false);
  const amount = parseVndInput(value);
  const display =
    !focused && String(value) !== '' && Number.isFinite(amount) && grouped
      ? new Intl.NumberFormat('vi-VN').format(amount)
      : String(value);
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={display}
      aria-invalid={String(value) !== '' && !Number.isFinite(amount)}
      onFocus={(event) => {
        const input = event.currentTarget;
        const start = input.selectionStart,
          end = input.selectionEnd,
          previous = input.value;
        flushSync(() => setFocused(true));
        if (start !== null && end !== null) {
          const position = (index: number) =>
            input.value === previous.replace(/[.,]/g, '')
              ? previous.slice(0, index).replace(/[.,]/g, '').length
              : Math.min(index, input.value.length);
          input.setSelectionRange(position(start), position(end));
        }
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => onValueChange(e.target.value)}
    />
  );
}
