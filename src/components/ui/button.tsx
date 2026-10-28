'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-body font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-control-touch sm:min-h-control px-4',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:bg-brand-hover',
        secondary: 'bg-surface text-brand border border-brand hover:bg-brand-light',
        ghost: 'text-brand-medium hover:bg-brand-light',
        danger: 'bg-danger text-on-brand hover:opacity-90',
        gold: 'bg-gold text-on-brand hover:opacity-90',
        onBrand: 'bg-transparent text-on-brand hover:bg-brand-hover',
      },
      size: {
        md: '',
        sm: 'min-h-9 sm:min-h-8 px-3 text-dense',
        icon: 'px-0 w-control-touch sm:w-control',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
Button.displayName = 'Button';
