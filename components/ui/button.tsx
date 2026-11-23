import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={twMerge(
        clsx(
          'inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50',
          className,
        ),
      )}
      {...props}
    />
  );
}
