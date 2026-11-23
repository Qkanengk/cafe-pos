export function Placeholder({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-8">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-800">
        Cafe Demo · Giai đoạn 1
      </p>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-stone-500">
        Không gian làm việc đã sẵn sàng. Tính năng này sẽ được triển khai trong
        giai đoạn tiếp theo.
      </p>
    </section>
  );
}
