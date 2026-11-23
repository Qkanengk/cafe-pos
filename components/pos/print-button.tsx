'use client';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { thermalPageRule } from '@/lib/printing';
export function PrintButton({ width }: { width: 58 | 80 }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const paper = document.querySelector<HTMLElement>('.paper');
    if (!paper) return;
    const style = document.createElement('style');
    document.body.appendChild(style);
    const measure = () => {
      const height = paper.getBoundingClientRect().height;
      if (height > 0) {
        style.textContent = thermalPageRule(width, height);
        setReady(true);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    window.addEventListener('beforeprint', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('beforeprint', measure);
      style.remove();
    };
  }, [width]);
  return (
    <Button disabled={!ready} onClick={() => window.print()}>
      <Printer size={20} className="mr-2" aria-hidden="true" />
      In ngay
    </Button>
  );
}
