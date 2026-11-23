import type { InputHTMLAttributes } from 'react';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 focus:outline-2 focus:outline-emerald-700 ' +
        (props.className ?? '')
      }
    />
  );
}
