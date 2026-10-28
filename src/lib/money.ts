/** Rupee text ⇄ integer paisa for form inputs (no floating point). Display formatting lives in utils.formatRs. */
export function rupeesToPaisa(s: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s.replace(/,/g, '').trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
}

export function paisaToRupeesInput(p: number | null | undefined): string {
  if (p === null || p === undefined) return '';
  const whole = Math.trunc(p / 100);
  const frac = p % 100;
  return frac ? `${whole}.${String(frac).padStart(2, '0')}` : String(whole);
}
