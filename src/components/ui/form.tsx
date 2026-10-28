'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-muted/70 focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-light disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-danger min-h-control-touch sm:min-h-control';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(control, 'py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(control, 'pr-8', className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-dense font-semibold text-ink', className)} {...props} />;
}

/** Label + control + required marker + field error. */
export function Field({ label, error, required, hint, children, className, htmlFor }: { label: string; error?: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="mt-1 text-dense text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-dense text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('inline-flex min-h-control items-center gap-2 text-body text-ink', className)}>
      <input type="checkbox" className="size-4 rounded accent-brand" {...props} />
      {label}
    </label>
  );
}

/** Inline banner for form-level errors / notices. */
export function Notice({ tone = 'danger', children, action }: { tone?: 'danger' | 'warning' | 'info' | 'success'; children: React.ReactNode; action?: React.ReactNode }) {
  const t = {
    danger: 'bg-danger-bg text-danger border-danger/30',
    warning: 'bg-warning-bg text-warning border-warning/30',
    info: 'bg-info-bg text-info border-info/30',
    success: 'bg-success-bg text-success border-success/30',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-control border px-3 py-2 text-dense', t)}>
      <div>{children}</div>
      {action}
    </div>
  );
}
