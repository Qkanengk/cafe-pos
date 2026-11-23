'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
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
        'fixed inset-0 m-auto max-h-[95dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-0 bg-white p-5 text-stone-800 shadow-2xl backdrop:bg-stone-950/50 sm:p-7 ' +
        (wide ? 'max-w-5xl' : 'max-w-xl')
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
