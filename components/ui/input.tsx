import type { InputHTMLAttributes } from 'react';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 focus:outline-2 focus:outline-emerald-700 ' +
        (props.className ?? '')
      }
    />
  );
}
