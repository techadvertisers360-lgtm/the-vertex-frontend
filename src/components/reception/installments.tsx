import { formatDate } from '@/lib/time';
import type { InstallmentView } from '@/lib/types';
import { formatRs } from '@/lib/utils';
import { SectionLabel } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';

/** Installment schedule with derived status (clinic decision Q7). */
export function InstallmentList({ items, title = 'Installments' }: { items: InstallmentView[]; title?: string }) {
  return (
    <div className="mt-3 border-t border-line pt-3">
      <SectionLabel className="mb-1">{title}</SectionLabel>
      <ul className="space-y-1 text-dense">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-canvas px-2 py-1.5">
            <span>
              #{i.seq} · due {formatDate(i.dueDate)}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-semibold">{formatRs(i.amountPaisa)}</span>
              {i.state !== 'PAID' && i.paidPaisa > 0 && <span className="text-muted">({formatRs(i.outstandingPaisa)} baqi)</span>}
              <StatusChip status={i.state} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
