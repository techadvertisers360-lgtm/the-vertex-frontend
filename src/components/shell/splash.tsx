import { Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand';

export function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas" aria-busy="true">
      <BrandLogo className="w-28" />
      <Loader2 className="size-6 animate-spin text-brand-medium" aria-label="Loading" />
    </div>
  );
}
