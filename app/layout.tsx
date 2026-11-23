import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Cafe Demo · Quầy bán hàng',
  description: 'Quản lý quán cà phê',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
