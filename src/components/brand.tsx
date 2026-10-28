import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The Vertex Health logo. The V mark sits on a small white tile so its teal stroke stays visible on the teal header.
 * Files: public/brand/logo-mark.png (V only) and public/brand/logo-full.png (V + wordmark).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-surface p-1', className)}>
      <Image src="/brand/logo-mark.png" alt="" width={453} height={394} className="h-full w-auto" priority />
    </span>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return <Image src="/brand/logo-full.png" alt="The Vertex Health" width={649} height={519} className={cn('h-auto w-40', className)} priority />;
}
