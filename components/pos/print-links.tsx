'use client';
import Link from 'next/link';
import { Printer, ClipboardList } from 'lucide-react';
export function PrintLinks({
  id,
  barOnly = false,
}: {
  id: string;
  barOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {!barOnly && (
        <Link
          target="_blank"
          href={'/print/receipt?orderId=' + id}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white"
        >
          <Printer size={20} aria-hidden="true" />
          In hóa đơn
        </Link>
      )}
      <Link
        target="_blank"
        href={'/print/bar?orderId=' + id}
        className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 font-semibold"
      >
        <ClipboardList size={20} aria-hidden="true" />
        In phiếu pha chế
      </Link>
    </div>
  );
}
