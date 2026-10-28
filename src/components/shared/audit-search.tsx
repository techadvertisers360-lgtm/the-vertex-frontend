"use client";
import * as React from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { get } from "@/lib/api";
import { addDays, clinicDate, formatDateTime } from "@/lib/time";
import type { PatientCard } from "@/lib/types";
import type { AuditRow } from "@/lib/manager-types";
import { titleCase } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { FilterBar } from "@/components/ui/table";

interface Lookups {
  users: { id: string; displayName: string; role: string; active: boolean }[];
  stockItems: { id: string; name: string }[];
}
interface Filters {
  from: string;
  to: string;
  actorId: string;
  role: string;
  action: string;
  recordType: string;
  patientId: string;
  appointmentId: string;
  stockItemId: string;
  requestId: string;
}

const ROLES = [
  "MD",
  "MANAGER",
  "MARKETING_DIRECTOR",
  "MARKETING_LEAD",
  "RECEPTIONIST",
  "DOCTOR",
  "ASSISTANT",
  "OFFICE_BOY",
  "LEAD_MEMBER",
];
const RECORD_TYPES = [
  "Appointment",
  "Patient",
  "Invoice",
  "Payment",
  "ProcedureTask",
  "RoomChecklistReport",
  "OfficeRound",
  "LeaveRequest",
  "Complaint",
  "RescheduleRequest",
  "StockItem",
  "StockDemand",
  "FollowUp",
  "StaffReview",
  "Setting",
  "User",
  "TreatmentPlanVersion",
];

function Json({ v }: { v: unknown }) {
  if (v === null || v === undefined)
    return <span className="text-muted">—</span>;
  if (v === "[restricted]")
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Lock className="size-3.5" /> restricted
      </span>
    );
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-control bg-canvas p-2 text-[12px] text-ink">
      {JSON.stringify(v, null, 2)}
    </pre>
  );
}

function Row({ r }: { r: AuditRow }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-brand" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-brand" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-dense">
            <span className="font-semibold text-ink">{r.action}</span>
            <Chip>{r.recordType}</Chip>
            {r.restricted && <Chip tone="warning">Clinical — restricted</Chip>}
          </span>
          <span className="block text-[12px] text-muted">
            {formatDateTime(r.at)} · {r.actorName}
            {r.actorRole ? ` (${titleCase(r.actorRole)})` : ""}
            {r.reason ? ` · ${r.reason}` : ""}
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-2 grid gap-2 pl-6 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted">Before</p>
            <Json v={r.before} />
          </div>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted">After</p>
            <Json v={r.after} />
          </div>
          <p className="text-[12px] text-muted md:col-span-2">
            Record id: {r.recordId ?? "—"}
          </p>
        </div>
      )}
    </li>
  );
}

/** Audit / history search (spec §14, §15): date, actor, role, patient, appointment, request, stock item. */
export function AuditSearch({
  label = "Manager",
  patientSearch = true,
}: {
  label?: string;
  patientSearch?: boolean;
}) {
  const today = clinicDate();
  const empty: Filters = {
    from: addDays(today, -7),
    to: today,
    actorId: "",
    role: "",
    action: "",
    recordType: "",
    patientId: "",
    appointmentId: "",
    stockItemId: "",
    requestId: "",
  };
  const [draft, setDraft] = React.useState<Filters>(empty);
  const [applied, setApplied] = React.useState<Filters>(empty);
  const [patientQ, setPatientQ] = React.useState("");
  const lookups = useQuery({
    queryKey: ["manager", "audit-lookups"],
    queryFn: () => get<Lookups>("/manager/audit/lookups"),
    staleTime: 5 * 60_000,
  });
  const patients = useQuery({
    queryKey: ["manager", "audit-patients", patientQ],
    queryFn: () =>
      get<{ items: PatientCard[] }>("/reception/search", { q: patientQ }),
    enabled: patientSearch && patientQ.trim().length >= 3,
  });
  const q = useInfiniteQuery({
    queryKey: ["manager", "audit", applied],
    initialPageParam: "" as string,
    queryFn: ({ pageParam }) =>
      get<{ items: AuditRow[]; nextCursor: string | null }>("/manager/audit", {
        ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const set =
    (k: keyof Filters) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader label={label} title="Audit & history" />
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(draft);
          }}
          className="space-y-3"
        >
          <FilterBar>
            <Field label="From" htmlFor="au-from">
              <Input
                id="au-from"
                type="date"
                value={draft.from}
                onChange={set("from")}
              />
            </Field>
            <Field label="To" htmlFor="au-to">
              <Input
                id="au-to"
                type="date"
                value={draft.to}
                onChange={set("to")}
              />
            </Field>
            <Field label="Actor" htmlFor="au-actor">
              <Select
                id="au-actor"
                value={draft.actorId}
                onChange={set("actorId")}
              >
                <option value="">Anyone</option>
                {lookups.data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({titleCase(u.role)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role" htmlFor="au-role">
              <Select id="au-role" value={draft.role} onChange={set("role")}>
                <option value="">Any role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Action contains" htmlFor="au-action">
              <Input
                id="au-action"
                value={draft.action}
                onChange={set("action")}
                placeholder="e.g. reschedul"
              />
            </Field>
            <Field label="Record type" htmlFor="au-type">
              <Select
                id="au-type"
                value={draft.recordType}
                onChange={set("recordType")}
              >
                <option value="">Any</option>
                {RECORD_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stock item" htmlFor="au-stock">
              <Select
                id="au-stock"
                value={draft.stockItemId}
                onChange={set("stockItemId")}
              >
                <option value="">Any</option>
                {lookups.data?.stockItems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FilterBar>
          {patientSearch && (
            <FilterBar>
              <Field label="Patient (phone / name)" htmlFor="au-pq">
                <Input
                  id="au-pq"
                  value={patientQ}
                  onChange={(e) => setPatientQ(e.target.value)}
                  placeholder="0300…"
                />
              </Field>
              <Field label="Patient match" htmlFor="au-pid">
                <Select
                  id="au-pid"
                  value={draft.patientId}
                  onChange={set("patientId")}
                >
                  <option value="">
                    {patientQ.trim().length >= 3
                      ? patients.data?.items.length
                        ? "Chunein"
                        : "Koi match nahi"
                      : "Pehle search karein"}
                  </option>
                  {patients.data?.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.phone}
                    </option>
                  ))}
                </Select>
              </Field>
            </FilterBar>
          )}
          <FilterBar>
            <Field label="Appointment id" htmlFor="au-appt">
              <Input
                id="au-appt"
                value={draft.appointmentId}
                onChange={set("appointmentId")}
              />
            </Field>
            <Field label="Request id" htmlFor="au-req">
              <Input
                id="au-req"
                value={draft.requestId}
                onChange={set("requestId")}
              />
            </Field>
          </FilterBar>
          <div className="flex gap-2">
            <Button type="submit">Search</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(empty);
                setApplied(empty);
                setPatientQ("");
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </Card>
      {q.isPending ? (
        <LoadingRows rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Is filter par koi record nahi" />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => q.fetchNextPage()}
                loading={q.isFetchingNextPage}
              >
                Load more
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
