'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { get } from '@/lib/api';
import { clinicDate, formatDay, formatTime } from '@/lib/time';
import type { DaySlots, Doctor, Service, Suggestion, SuggestionReason } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';

export function useDoctors() {
  return useQuery({ queryKey: ['scheduling', 'doctors'], queryFn: () => get<{ items: Doctor[] }>('/scheduling/doctors'), staleTime: 5 * 60_000 });
}
export function useServices() {
  return useQuery({ queryKey: ['scheduling', 'services'], queryFn: () => get<{ items: Service[] }>('/scheduling/services'), staleTime: 5 * 60_000 });
}

/** Human explanation for a suggestion (spec §6 "reason dikhaye"). */
export function reasonText(r: SuggestionReason): string {
  const planned = r.source === 'planned_procedure' ? ' (planned procedure)' : '';
  switch (r.code) {
    case 'AFTER_CONSULTATION':
      return `Consultation ${formatTime(r.refEnd)} par khatam${planned} — ${r.bufferMin} min baad`;
    case 'AFTER_PROCEDURE':
      return `Procedure ${formatTime(r.refEnd)} par khatam${planned} — ${r.bufferMin} min baad`;
    case 'NEXT_FREE_ROOM':
      return `Agla free room ${formatTime(r.refEnd)} se`;
    case 'NEXT_AVAILABLE_DATE':
      return 'Doctor ki agli available date';
    case 'NEXT_WORKING_HOURS':
      return 'Doctor ke agle available hours';
    case 'LATER_SLOT':
      return 'Baad ka available slot';
  }
}

export function SuggestionButtons({ suggestions, onPick }: { suggestions: Suggestion[]; onPick: (s: Suggestion) => void }) {
  if (!suggestions.length) return <p className="text-dense text-muted">Agle dinon mein koi available slot nahi mila.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {suggestions.map((s) => (
        <li key={s.start}>
          <button type="button" onClick={() => onPick(s)} className="w-full rounded-control border border-brand-medium bg-surface px-3 py-2 text-left hover:bg-brand-light">
            <span className="block text-dense font-semibold text-brand">
              {formatDay(s.start)} · {formatTime(s.start)}
            </span>
            <span className="block text-[12px] text-muted">{reasonText(s.reason)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface SlotValue {
  start: string; // ISO UTC
  roomId?: string;
  roomCode?: string | null;
}

/**
 * Date + free-slot grid for one Doctor and appointment type. Only bookable slots are shown; leave and
 * "Manager approval pending" alternate hours are labelled; when the day is empty the next available
 * date/time suggestions are offered. The backend re-checks everything at final save. The room is not shown while
 * booking (D-070): the slot only proves a compatible room is free; Reception assigns the actual room at check-in.
 */
export function SlotPicker({
  doctorId,
  type,
  serviceId,
  value,
  onChange,
}: {
  doctorId: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  serviceId?: string;
  value: SlotValue | null;
  onChange: (v: SlotValue | null) => void;
}) {
  const [date, setDate] = React.useState(() => (value ? clinicDate(new Date(value.start)) : clinicDate()));
  const q = useQuery({
    queryKey: ['scheduling', 'slots', doctorId, type, date, serviceId ?? ''],
    queryFn: () => get<DaySlots>('/scheduling/slots', { doctorId, type, date, serviceId }),
    enabled: !!doctorId && !!date,
  });

  const pick = (s: { start: string; roomId: string; roomCode: string | null }) => onChange({ start: s.start, roomId: s.roomId, roomCode: s.roomCode });

  return (
    <div className="space-y-3">
      <Field label="Date" required htmlFor="slot-date" className="max-w-56">
        <Input
          id="slot-date"
          type="date"
          value={date}
          min={clinicDate()}
          onChange={(e) => {
            setDate(e.target.value);
            onChange(null);
          }}
        />
      </Field>
      {!doctorId ? (
        <p className="text-dense text-muted">Pehle Doctor chunein.</p>
      ) : q.isPending ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          {q.data.onLeave.length > 0 && <Notice tone="warning">Doctor us din chutti par hain — is waqt booking nahi ho sakti.</Notice>}
          {q.data.pendingAlternate.map((p) => (
            <Notice key={p.start} tone="info">
              Alternate time {formatTime(p.start)}–{formatTime(p.end)}: {p.label}
            </Notice>
          ))}
          {q.data.slots.length > 0 ? (
            <div>
              <p className="mb-2 text-dense text-muted">
                <CalendarClock className="mr-1 inline size-4" aria-hidden />
                {q.data.slots.length} free slots · {q.data.durationMin} min
              </p>
              <div role="listbox" aria-label="Available slots" className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {q.data.slots.map((s) => {
                  const selected = value?.start === s.start;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(s)}
                      className={cn(
                        'min-h-control-touch rounded-control border px-2 text-dense font-semibold sm:min-h-control',
                        selected ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink hover:border-brand-medium hover:bg-brand-light',
                      )}
                    >
                      {formatTime(s.start)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Notice tone="warning">Is din koi available slot nahi. Agla available date/time:</Notice>
              <SuggestionButtons
                suggestions={q.data.nextAvailable}
                onPick={(s) => {
                  setDate(clinicDate(new Date(s.start)));
                  pick(s);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Doctor + type + service selectors used by every booking form. */
export function DoctorServiceFields({
  doctorId,
  type,
  serviceId,
  onChange,
  lockDoctor,
}: {
  doctorId: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  serviceId: string;
  onChange: (v: { doctorId?: string; type?: 'CONSULTATION' | 'PROCEDURE'; serviceId?: string }) => void;
  lockDoctor?: boolean;
}) {
  const doctors = useDoctors();
  const services = useServices();
  const svc = (services.data?.items ?? []).filter((s) => s.type === type);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Doctor" required htmlFor="doctor">
        <Select id="doctor" value={doctorId} disabled={lockDoctor} onChange={(e) => onChange({ doctorId: e.target.value })}>
          <option value="">Doctor chunein…</option>
          {doctors.data?.items.map((d) => (
            <option key={d.id} value={d.id}>
              {d.displayName}
              {d.doctorProfile?.specialty ? ` — ${d.doctorProfile.specialty}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Type" required htmlFor="type">
        <Select id="type" value={type} onChange={(e) => onChange({ type: e.target.value as 'CONSULTATION' | 'PROCEDURE', serviceId: '' })}>
          <option value="CONSULTATION">Consultation</option>
          <option value="PROCEDURE">Procedure</option>
        </Select>
      </Field>
      <Field label="Service" htmlFor="service" hint="Naam likh kar search karein — duration isi se banti hai">
        <SearchSelect id="service" value={serviceId} options={svc} emptyLabel={type === 'PROCEDURE' ? 'Procedure chunein…' : 'General consultation'} onChange={(v) => onChange({ serviceId: v })} />
      </Field>
    </div>
  );
}

/**
 * Dropdown with a search box for long lists (the procedures list): type part of a name to narrow it, click or press
 * Enter to pick. The empty choice stays on top.
 */
export function SearchSelect({
  id,
  value,
  options,
  emptyLabel,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  options: { id: string; name: string }[];
  emptyLabel: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const selected = options.find((o) => o.id === value);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options;
  const items = [{ id: '', name: emptyLabel }, ...shown];
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        disabled={disabled}
        value={open ? q : (selected?.name ?? '')}
        placeholder={selected?.name ?? emptyLabel}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(e.target.value.trim() ? 1 : 0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            const it = items[active] ?? items[0];
            if (it) pick(it.id);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full min-w-56 overflow-auto rounded-control border border-line bg-surface py-1 shadow-card">
          {items.map((o, i) => (
            <li
              key={o.id || 'none'}
              role="option"
              aria-selected={o.id === value}
              // mousedown, not click: the input's blur would close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.id);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('cursor-pointer px-3 py-2 text-dense', i === active ? 'bg-brand-light text-ink' : 'text-ink', o.id === value && 'font-semibold', !o.id && 'text-muted')}
            >
              {o.name}
            </li>
          ))}
          {needle && shown.length === 0 && <li className="px-3 py-2 text-dense text-muted">Is naam se kuch nahi mila</li>}
        </ul>
      )}
    </div>
  );
}
