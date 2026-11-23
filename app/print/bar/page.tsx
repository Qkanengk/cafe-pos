import { PrintPage } from '@/components/pos/print-page';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  return <PrintPage id={(await searchParams).orderId} bar={true} />;
}
