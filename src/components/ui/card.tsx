import * as React from 'react';
import { cn } from '@/lib/utils';

export type Accent = 'ops' | 'leadership' | 'danger' | 'none';

const accentClass: Record<Accent, string> = {
  ops: 'border-l-[length:var(--spacing-accent)] border-l-accent-ops',
  leadership: 'border-l-[length:var(--spacing-accent)] border-l-accent-leadership',
  danger: 'border-l-[length:var(--spacing-accent)] border-l-danger',
  none: '',
};

/** White card, 12px radius, 1px line border, soft shadow; optional 4px role accent on the left. */
export function Card({ className, accent = 'none', ...props }: React.HTMLAttributes<HTMLDivElement> & { accent?: Accent }) {
  return <div className={cn('rounded-card border border-line bg-surface shadow-card p-4 sm:p-5', accentClass[accent], className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex flex-wrap items-start justify-between gap-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-card-title text-ink', className)} {...props} />;
}

export function SectionLabel({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('section-label', className)} {...props} />;
}

/** Dark teal hero/section banner with a small gold uppercase label above a white title. */
export function HeroBanner({ label, title, subtitle, actions }: { label: string; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="rounded-card bg-brand px-5 py-5 text-on-brand sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label !text-gold">{label}</p>
          <h1 className="mt-1 text-title text-on-brand">{title}</h1>
          {subtitle && <p className="mt-1 text-body text-on-brand-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function PageHeader({ label, title, actions }: { label?: string; title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {label && <SectionLabel>{label}</SectionLabel>}
        <h1 className="text-title text-ink">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({ label, value, hint, onClick, active, accent = 'ops' }: { label: string; value: React.ReactNode; hint?: string; onClick?: () => void; active?: boolean; accent?: Accent }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'rounded-card border border-line bg-surface p-4 text-left shadow-card transition-colors',
        accentClass[accent],
        onClick && 'hover:bg-brand-light',
        active && 'bg-brand-light ring-1 ring-brand-medium',
      )}
    >
      <p className="section-label">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-8 text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-dense text-muted">{hint}</p>}
    </Comp>
  );
}
