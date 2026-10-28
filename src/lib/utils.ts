import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know the custom font-size tokens from tokens.css; otherwise it treats e.g. `text-dense`
 * as a text *color* and drops `text-on-brand` when both are present.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['label', 'title', 'card-title', 'body', 'dense'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Integer paisa → "Rs 12,345" (money is never handled as floats; display only). */
export function formatRs(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return '—';
  const neg = paisa < 0;
  const abs = Math.abs(paisa);
  const whole = Math.trunc(abs / 100).toLocaleString('en-PK');
  const frac = abs % 100;
  return `${neg ? '-' : ''}Rs ${whole}${frac ? '.' + String(frac).padStart(2, '0') : ''}`;
}

/** 923001234567 → 0300-1234567 for display. */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return '—';
  if (/^923\d{9}$/.test(p)) return `0${p.slice(2, 5)}-${p.slice(5)}`;
  return `+${p}`;
}

export const telHref = (p: string) => `tel:+${p}`;
export const whatsappHref = (p: string) => `https://wa.me/${p}`;

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
