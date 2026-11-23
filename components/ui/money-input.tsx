'use client';
import {
  useState,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type InputHTMLAttributes,
} from 'react';
import { Input } from './input';
import { parseVndInput, parsePercentInput } from '@/lib/money';
import { editVndInput } from '@/lib/money-edit';
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
  const [lastValid, setLastValid] = useState('');
  const [caret, setCaret] = useState<{
    input: HTMLInputElement;
    position: number;
  } | null>(null);
  const pasted = useRef<string | null>(null);
  const rangeDeletion = useRef(false);
  useLayoutEffect(() => {
    if (caret && document.activeElement === caret.input)
      caret.input.setSelectionRange(caret.position, caret.position);
  }, [caret]);
  const errorId = useId();
  const amount = grouped ? parseVndInput(value) : parsePercentInput(value);
  const invalid = String(value) !== '' && !Number.isFinite(amount);
  const message = grouped
    ? 'Nhập số tiền nguyên (ví dụ 50.000, 50,000 hoặc 50000); không nhập số thập phân.'
    : 'Nhập phần trăm nguyên từ 0 đến 100; không dùng dấu chấm hoặc phẩy.';
  const display =
    String(value) !== '' && Number.isFinite(amount) && grouped
      ? new Intl.NumberFormat('vi-VN').format(amount)
      : grouped && invalid
        ? lastValid
        : String(value);
  return (
    <>
      <Input
        {...props}
        disabled={props.disabled || !interactive}
        type="text"
        inputMode="numeric"
        value={display}
        aria-invalid={invalid}
        aria-describedby={
          [props['aria-describedby'], invalid ? errorId : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        onPaste={(event) => {
          props.onPaste?.(event);
          pasted.current = event.clipboardData.getData('text');
        }}
        onSelect={(event) => {
          const input = event.currentTarget;
          rangeDeletion.current = input.selectionStart !== input.selectionEnd;
          props.onSelect?.(event);
        }}
        onKeyDown={(event) => {
          const input = event.currentTarget;
          rangeDeletion.current = input.selectionStart !== input.selectionEnd;
          props.onKeyDown?.(event);
        }}
        onCut={(event) => {
          rangeDeletion.current = true;
          props.onCut?.(event);
        }}
        onChange={(event) => {
          if (!grouped) {
            onValueChange(event.currentTarget.value);
            return;
          }
          const input = event.currentTarget,
            native = event.nativeEvent as InputEvent;
          const next = editVndInput({
            previous: display,
            text: input.value,
            caret: input.selectionStart ?? input.value.length,
            inputType: native.inputType ?? '',
            rangeDeletion: rangeDeletion.current,
            data:
              native.inputType === 'insertFromPaste'
                ? pasted.current
                : native.data,
          });
          pasted.current = null;
          rangeDeletion.current = false;
          setLastValid(next.display);
          setCaret({ input, position: next.caret });
          onValueChange(next.value);
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
