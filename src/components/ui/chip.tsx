import { cn } from '@/lib/utils';
import { statusLabel, toneFor, type Tone } from '@/lib/status';

const toneClass: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-neutral-bg text-neutral',
  brand: 'bg-brand-light text-brand',
  gold: 'bg-gold-light text-gold',
};

export function Chip({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5', toneClass[tone], className)}>{children}</span>;
}

/** Pill for any backend status value (lead, appointment, task, request, message). */
export function StatusChip({ status, className }: { status: string; className?: string }) {
  return (
    <Chip tone={toneFor(status)} className={className}>
      {statusLabel(status)}
    </Chip>
  );
}
