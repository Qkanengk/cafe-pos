'use client';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer size={20} className="mr-2" aria-hidden="true" />
      In ngay
    </Button>
  );
}
