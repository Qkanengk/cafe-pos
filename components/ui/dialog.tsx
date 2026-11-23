'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={
        'dialog-panel fixed inset-0 m-auto max-h-[95dvh] w-[calc(100%-1.5rem)] overflow-y-auto bg-white p-5 text-stone-800 backdrop:bg-stone-950/40 sm:p-6 ' +
        (wide ? 'max-w-5xl' : 'max-w-xl') +
        ' ' +
        className
      }
    >
      <header className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
