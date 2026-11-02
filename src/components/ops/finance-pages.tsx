'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { get, post, put } from '@/lib/api';
import { rupeesToPaisa } from '@/lib/money';
import { formatDate, formatDateTime } from '@/lib/time';
import { formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input, Select } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';
import { ActError, bpText, Loaded, MonthField, percentToBp, thisMonth, useAct } from './common';

// ───────────── Profit and loss ─────────────

interface Pnl { invoices: number; billedPaisa: number; packagesPaisa: number; receivedPaisa: number; toReceivePaisa: number; doctorSharePaisa: number; procedureStockPaisa: number; pharmacyStockPaisa: number; salariesPaisa: number; expensesPaisa: number; totalCostsPaisa: number; profitPaisa: number; marginBp: number }

const Line = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
  <div className={`flex justify-between gap-3 border-b border-line py-1 text-dense ${strong ? 'font-semibold text-ink' : ''}`}><span>{label}</span><span>{formatRs(value)}</span></div>
);

function PnlTab({ month }: { month: string }) {
  const q = useQuery({ queryKey: ['ops', 'pnl', month], queryFn: () => get<Pnl>('/ops/profit-loss', { month }) });
  return (
    <Loaded q={q}>
      {(d) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={d.profitPaisa >= 0 ? 'Profit' : 'Loss'} value={formatRs(Math.abs(d.profitPaisa))} accent={d.profitPaisa >= 0 ? 'ops' : 'danger'} hint={`Margin ${d.marginBp / 100}%`} />
            <StatTile label="Total billed" value={formatRs(d.billedPaisa)} hint={`${d.invoices} invoices`} />
            <StatTile label="Received" value={formatRs(d.receivedPaisa)} />
            <StatTile label="Still to receive" value={formatRs(d.toReceivePaisa)} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Money in</CardTitle></CardHeader>
              <Line label="Total billed (treatments, consultations, pharmacy, packages)" value={d.billedPaisa} strong />
              <Line label="In mein se packages" value={d.packagesPaisa} />
            </Card>
            <Card>
              <CardHeader><CardTitle>Costs</CardTitle></CardHeader>
              <Line label="Doctor share" value={d.doctorSharePaisa} />
              <Line label="Procedure stock" value={d.procedureStockPaisa} />
              <Line label="Pharmacy stock" value={d.pharmacyStockPaisa} />
              <Line label="Salaries" value={d.salariesPaisa} />
              <Line label="Expenses" value={d.expensesPaisa} />
              <Line label="Total costs" value={d.totalCostsPaisa} strong />
            </Card>
          </div>
          <Button variant="secondary" className="print:hidden" onClick={() => window.print()}><Printer className="size-4" /> Print or save as PDF</Button>
        </div>
      )}
    </Loaded>
  );
}

// ───────────── Expenses ─────────────

interface Expenses { totalPaisa: number; byCategory: { category: string; totalPaisa: number }[]; items: { id: string; date: string; category: string; description: string; amountPaisa: number; paidFrom: string; createdBy: string | null }[] }

function ExpensesTab({ month }: { month: string }) {
  const q = useQuery({ queryKey: ['ops', 'expenses', month], queryFn: () => get<Expenses>('/ops/expenses', { month }) });
  const [category, setCategory] = React.useState('Rent');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [paidFrom, setPaidFrom] = React.useState('OWNER');
  const add = useAct(() => post('/ops/expenses', { category: category.trim(), description: description.trim(), amountPaisa: rupeesToPaisa(amount) ?? 0, paidFrom }), 'Kharcha save ho gaya', () => { setDescription(''); setAmount(''); });
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader><CardTitle>Add an expense</CardTitle></CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Type" required htmlFor="e-c"><Input id="e-c" list="e-cats" value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
          <datalist id="e-cats">{['Rent', 'Bills', 'Marketing', 'Office purchases', 'Repairs', 'Other'].map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="What was it for" required htmlFor="e-d"><Input id="e-d" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Amount (Rs)" required htmlFor="e-a"><Input id="e-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Paid from" htmlFor="e-p">
            <Select id="e-p" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>
              <option value="OWNER">Owner&apos;s pocket</option>
              <option value="RECEPTION_DRAWER">Reception drawer</option>
              <option value="MANAGER">Manager&apos;s cash</option>
              <option value="BANK">Bank</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 space-y-2">
          <ActError error={add.error} />
          <Button disabled={category.trim().length < 2 || description.trim().length < 2 || !rupeesToPaisa(amount)} loading={add.isPending} onClick={() => add.mutate(undefined)}>Save expense</Button>
        </div>
      </Card>
      <Loaded q={q}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="This month" value={formatRs(d.totalPaisa)} hint={`${d.items.length} entries`} />
              {d.byCategory.slice(0, 3).map((c) => <StatTile key={c.category} label={c.category} value={formatRs(c.totalPaisa)} />)}
            </div>
            {d.items.length === 0 ? <EmptyState title="Is mahine koi kharcha nahi" /> : (
              <DataTable
                rows={d.items}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'd', header: 'Date', cell: (r) => formatDate(r.date) },
                  { key: 'c', header: 'Type', cell: (r) => r.category },
                  { key: 'w', header: 'For', cell: (r) => r.description },
                  { key: 'a', header: 'Amount', cell: (r) => formatRs(r.amountPaisa) },
                  { key: 'p', header: 'From', cell: (r) => titleCase(r.paidFrom), hideSm: true },
                  { key: 'b', header: 'By', cell: (r) => r.createdBy, hideSm: true },
                ]}
              />
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}

// ───────────── Doctor ledger ─────────────

interface Rule { ownConsultBp: number; ownProcedureBp: number; clinicConsultBp: number; clinicProcedureBp: number; fixedCostPaisa: number }
interface LedgerDoctor { doctorId: string; name: string; rule: Rule | null; rows: { invoiceId: string; number: string; patient: string | null; own: boolean; type: string; billPaisa: number; itemCostPaisa: number; fixedCostPaisa: number; bp: number; sharePaisa: number }[]; monthSharePaisa: number; earnedPaisa: number; paidPaisa: number; balancePaisa: number }

function DoctorCard({ d }: { d: LedgerDoctor }) {
  const r = d.rule;
  const [own1, setOwn1] = React.useState(String((r?.ownConsultBp ?? 0) / 100));
  const [own2, setOwn2] = React.useState(String((r?.ownProcedureBp ?? 0) / 100));
  const [cl1, setCl1] = React.useState(String((r?.clinicConsultBp ?? 0) / 100));
  const [cl2, setCl2] = React.useState(String((r?.clinicProcedureBp ?? 0) / 100));
  const [fixed, setFixed] = React.useState(String((r?.fixedCostPaisa ?? 0) / 100));
  const [pay, setPay] = React.useState('');
  const [method, setMethod] = React.useState('Cash');
  const bps = [own1, own2, cl1, cl2].map(percentToBp);
  const save = useAct(() => put(`/ops/doctor-ledger/${d.doctorId}/rule`, { ownConsultBp: bps[0], ownProcedureBp: bps[1], clinicConsultBp: bps[2], clinicProcedureBp: bps[3], fixedCostPaisa: rupeesToPaisa(fixed) ?? 0 }), 'Percentages save ho gaye');
  const paid = useAct(() => post(`/ops/doctor-ledger/${d.doctorId}/pay`, { amountPaisa: rupeesToPaisa(pay) ?? 0, method }), 'Payment save ho gayi', () => setPay(''));
  return (
    <Card>
      <CardHeader><CardTitle>{d.name}</CardTitle><span className="text-card-title">{formatRs(d.balancePaisa)} baqi</span></CardHeader>
      <p className="text-dense text-muted">Is mahine {formatRs(d.monthSharePaisa)} · Kul kamai {formatRs(d.earnedPaisa)} · Paid {formatRs(d.paidPaisa)}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Field label="Own: consultation %" htmlFor={`${d.doctorId}-1`}><Input id={`${d.doctorId}-1`} value={own1} onChange={(e) => setOwn1(e.target.value)} /></Field>
        <Field label="Own: procedure %" htmlFor={`${d.doctorId}-2`}><Input id={`${d.doctorId}-2`} value={own2} onChange={(e) => setOwn2(e.target.value)} /></Field>
        <Field label="Clinic: consultation %" htmlFor={`${d.doctorId}-3`}><Input id={`${d.doctorId}-3`} value={cl1} onChange={(e) => setCl1(e.target.value)} /></Field>
        <Field label="Clinic: procedure %" htmlFor={`${d.doctorId}-4`}><Input id={`${d.doctorId}-4`} value={cl2} onChange={(e) => setCl2(e.target.value)} /></Field>
        <Field label="Fixed extra cost (Rs)" htmlFor={`${d.doctorId}-5`}><Input id={`${d.doctorId}-5`} value={fixed} onChange={(e) => setFixed(e.target.value)} /></Field>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Button size="sm" variant="secondary" disabled={bps.some((b) => b === null) || rupeesToPaisa(fixed) === null} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save percentages</Button>
        <Field label="Doctor ko payment (Rs)" htmlFor={`${d.doctorId}-p`}><Input id={`${d.doctorId}-p`} inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} /></Field>
        <Field label="Method" htmlFor={`${d.doctorId}-m`}><Select id={`${d.doctorId}-m`} value={method} onChange={(e) => setMethod(e.target.value)}><option>Cash</option><option>Bank</option><option>Cheque</option></Select></Field>
        <Button size="sm" disabled={!rupeesToPaisa(pay)} loading={paid.isPending} onClick={() => paid.mutate(undefined)}>Record payment</Button>
      </div>
      <ActError error={save.error ?? paid.error} />
      {d.rows.length > 0 && (
        <div className="mt-3">
          <DataTable
            rows={d.rows}
            rowKey={(x) => x.invoiceId}
            columns={[
              { key: 'p', header: 'Patient', cell: (x) => `${x.patient ?? '—'} · ${x.own ? 'Own' : 'Clinic'} · ${x.type}` },
              { key: 'b', header: 'Bill', cell: (x) => formatRs(x.billPaisa) },
              { key: 'c', header: 'Item cost', cell: (x) => formatRs(x.itemCostPaisa), hideSm: true },
              { key: 'f', header: 'Extra', cell: (x) => formatRs(x.fixedCostPaisa), hideSm: true },
              { key: 'r', header: '%', cell: (x) => bpText(x.bp) },
              { key: 's', header: 'Share', cell: (x) => <span className="font-semibold">{formatRs(x.sharePaisa)}</span> },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

function LedgerTab({ month }: { month: string }) {
  const q = useQuery({ queryKey: ['ops', 'ledger', month], queryFn: () => get<{ doctors: LedgerDoctor[] }>('/ops/doctor-ledger', { month }) });
  return (
    <Loaded q={q} empty={(d) => d.doctors.length === 0} emptyTitle="Koi doctor nahi">
      {(d) => (
        <div className="space-y-3">
          <p className="text-dense text-muted">Consultation: bill ka hissa. Procedure: item cost aur fixed extra cost nikal kar bill ka hissa.</p>
          {d.doctors.map((x) => <DoctorCard key={x.doctorId} d={x} />)}
        </div>
      )}
    </Loaded>
  );
}

export function MySharePage() {
  const [month, setMonth] = React.useState(thisMonth());
  const q = useQuery({ queryKey: ['ops', 'my-share', month], queryFn: () => get<{ rows: { invoiceId: string; patient: string | null; own: boolean; type: string; billPaisa: number; bp: number; sharePaisa: number }[]; monthSharePaisa: number; earnedPaisa: number; paidPaisa: number; balancePaisa: number }>('/ops/my-share', { month }) });
  return (
    <div className="space-y-3">
      <PageHeader label="Doctor" title="My Share" />
      <MonthField value={month} onChange={setMonth} />
      <Loaded q={q}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Is mahine" value={formatRs(d.monthSharePaisa)} />
              <StatTile label="Total earned" value={formatRs(d.earnedPaisa)} />
              <StatTile label="Already paid" value={formatRs(d.paidPaisa)} />
              <StatTile label="Balance" value={formatRs(d.balancePaisa)} />
            </div>
            {d.rows.length === 0 ? <EmptyState title="Is mahine koi bill nahi" /> : (
              <DataTable
                rows={d.rows}
                rowKey={(x) => x.invoiceId}
                columns={[
                  { key: 'p', header: 'Patient', cell: (x) => `${x.patient ?? '—'} · ${x.own ? 'Own patient' : 'Clinic patient'} · ${x.type}` },
                  { key: 'b', header: 'Bill', cell: (x) => formatRs(x.billPaisa) },
                  { key: 'r', header: '%', cell: (x) => bpText(x.bp) },
                  { key: 's', header: 'Doctor share', cell: (x) => <span className="font-semibold">{formatRs(x.sharePaisa)}</span> },
                ]}
              />
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}

// ───────────── Payroll ─────────────

interface Staff { id: string; displayName: string; role: string; phone: string | null; salaryPaisa: number; workingDays: number; startDate: string | null; emergencyContact: string | null; personalEmail: string | null; absences: number; lates: number; uniformNotes: number; absenceDeductionPaisa: number; advanceBalancePaisa: number; slip: { number: string; netPaisa: number; absenceDeductionPaisa: number; advanceCutPaisa: number; salaryPaisa: number; extraAbsences: number; month: string; paidAt: string } | null }

function StaffCard({ s, month, onPrint }: { s: Staff; month: string; onPrint: (kind: 'slip' | 'agreement', s: Staff) => void }) {
  const [salary, setSalary] = React.useState(String(s.salaryPaisa / 100));
  const [days, setDays] = React.useState(String(s.workingDays));
  const [start, setStart] = React.useState(s.startDate ?? '');
  const [emergency, setEmergency] = React.useState(s.emergencyContact ?? '');
  const [advance, setAdvance] = React.useState('');
  const [cut, setCut] = React.useState('0');
  const save = useAct(() => put(`/ops/staff/${s.id}`, { salaryPaisa: rupeesToPaisa(salary) ?? 0, workingDays: Number(days) || 24, startDate: start || null, emergencyContact: emergency.trim() || null }), 'Profile save ho gaya');
  const mark = useAct((kind: 'ABSENCE' | 'LATE' | 'UNIFORM') => post(`/ops/staff/${s.id}/marks`, { month, kind }), 'Note ho gaya');
  const give = useAct(() => post(`/ops/staff/${s.id}/advance`, { amountPaisa: rupeesToPaisa(advance) ?? 0 }), 'Advance de diya', () => setAdvance(''));
  const pay = useAct(() => post(`/ops/staff/${s.id}/pay`, { month, advanceCutPaisa: rupeesToPaisa(cut) ?? 0 }), 'Salary slip ban gayi');
  const net = s.salaryPaisa - s.absenceDeductionPaisa - (rupeesToPaisa(cut) ?? 0);
  return (
    <Card>
      <CardHeader><CardTitle>{s.displayName}</CardTitle><Chip tone={s.slip ? 'success' : 'neutral'}>{s.slip ? `Paid ${formatRs(s.slip.netPaisa)}` : titleCase(s.role)}</Chip></CardHeader>
      <p className="text-dense text-muted">Absences {s.absences} · Late {s.lates} · Uniform notes {s.uniformNotes} · Advance baqi {formatRs(s.advanceBalancePaisa)}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Salary (Rs)" htmlFor={`${s.id}-s`}><Input id={`${s.id}-s`} inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} /></Field>
        <Field label="Working days" htmlFor={`${s.id}-d`}><Input id={`${s.id}-d`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Start date" htmlFor={`${s.id}-t`}><Input id={`${s.id}-t`} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Emergency contact" htmlFor={`${s.id}-e`}><Input id={`${s.id}-e`} value={emergency} onChange={(e) => setEmergency(e.target.value)} /></Field>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Button size="sm" variant="secondary" disabled={rupeesToPaisa(salary) === null} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save profile</Button>
        <Button size="sm" variant="ghost" loading={mark.isPending} onClick={() => mark.mutate('ABSENCE')}>Mark absence</Button>
        <Button size="sm" variant="ghost" loading={mark.isPending} onClick={() => mark.mutate('LATE')}>Mark late</Button>
        <Button size="sm" variant="ghost" loading={mark.isPending} onClick={() => mark.mutate('UNIFORM')}>Uniform note</Button>
        <Button size="sm" variant="ghost" onClick={() => onPrint('agreement', s)}><Printer className="size-4" /> Agreement</Button>
        {s.slip && <Button size="sm" variant="ghost" onClick={() => onPrint('slip', s)}><Printer className="size-4" /> Slip</Button>}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2">
        <Field label="Advance dein (Rs)" htmlFor={`${s.id}-a`}><Input id={`${s.id}-a`} inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} /></Field>
        <Button size="sm" variant="secondary" disabled={!rupeesToPaisa(advance)} loading={give.isPending} onClick={() => give.mutate(undefined)}>Give advance</Button>
        {!s.slip && (
          <>
            <Field label="Advance katoti (Rs)" htmlFor={`${s.id}-c`}><Input id={`${s.id}-c`} inputMode="decimal" value={cut} onChange={(e) => setCut(e.target.value)} /></Field>
            <Button size="sm" disabled={s.salaryPaisa <= 0 || net < 0 || rupeesToPaisa(cut) === null} loading={pay.isPending} onClick={() => pay.mutate(undefined)}>Pay {formatRs(net)} and make slip</Button>
          </>
        )}
      </div>
      <ActError error={save.error ?? mark.error ?? give.error ?? pay.error} />
    </Card>
  );
}

function PayrollTab({ month }: { month: string }) {
  const q = useQuery({ queryKey: ['ops', 'staff', month], queryFn: () => get<{ items: Staff[] }>('/ops/staff', { month }) });
  const [doc, setDoc] = React.useState<{ kind: 'slip' | 'agreement'; s: Staff } | null>(null);
  React.useEffect(() => {
    if (doc) { window.print(); setDoc(null); }
  }, [doc]);
  return (
    <>
      <div className="space-y-3 print:hidden">
        <p className="text-dense text-muted">Extra absence ki katoti: salary ÷ working days. Doctors ki payment Doctor ledger mein hai.</p>
        <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Koi staff nahi">
          {(d) => d.items.map((s) => <StaffCard key={s.id} s={s} month={month} onPrint={(kind, x) => setDoc({ kind, s: x })} />)}
        </Loaded>
      </div>
      {doc?.kind === 'slip' && doc.s.slip && (
        <div className="hidden print:block">
          <h1 className="text-title">The Vertex Health: Salary Slip {doc.s.slip.number}</h1>
          <p>{doc.s.displayName} · {doc.s.slip.month}</p>
          <p>Salary {formatRs(doc.s.slip.salaryPaisa)}</p>
          <p>Absence deduction ({doc.s.slip.extraAbsences}) {formatRs(doc.s.slip.absenceDeductionPaisa)}</p>
          <p>Advance cut {formatRs(doc.s.slip.advanceCutPaisa)}</p>
          <p><strong>Net {formatRs(doc.s.slip.netPaisa)}</strong></p>
          <p>Paid {formatDateTime(doc.s.slip.paidAt)}</p>
        </div>
      )}
      {doc?.kind === 'agreement' && (
        <div className="hidden print:block">
          <h1 className="text-title">The Vertex Health: Staff Agreement</h1>
          <p>Name: {doc.s.displayName}</p>
          <p>Role: {titleCase(doc.s.role)}</p>
          <p>Start date: {doc.s.startDate ? formatDate(doc.s.startDate) : '__________'}</p>
          <p>Monthly salary: {formatRs(doc.s.salaryPaisa)}</p>
          <p>Emergency contact: {doc.s.emergencyContact ?? '__________'}</p>
          <p className="mt-10">Signature (staff): __________________ &nbsp;&nbsp; Signature (clinic): __________________</p>
        </div>
      )}
    </>
  );
}

// ───────────── Procedure costs, data check, campaigns ─────────────

function CostsTab({ month }: { month: string }) {
  const q = useQuery({ queryKey: ['ops', 'costs', month], queryFn: () => get<{ costPaisa: number; billedPaisa: number; rows: { number: string; patient: string | null; items: string[]; costPaisa: number; billedPaisa: number; leftPaisa: number }[] }>('/ops/procedure-costs', { month }) });
  return (
    <Loaded q={q}>
      {(d) => (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Stock cost" value={formatRs(d.costPaisa)} />
            <StatTile label="Billed" value={formatRs(d.billedPaisa)} />
            <StatTile label="Left after stock" value={formatRs(d.billedPaisa - d.costPaisa)} />
          </div>
          {d.rows.length === 0 ? <EmptyState title="Is mahine kisi procedure mein stock istemal nahi hua" /> : (
            <DataTable
              rows={d.rows}
              rowKey={(r) => r.number}
              columns={[
                { key: 'p', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient ?? '—'}</span> },
                { key: 'i', header: 'Items used', cell: (r) => r.items.join(', ') },
                { key: 'c', header: 'Cost', cell: (r) => formatRs(r.costPaisa) },
                { key: 'b', header: 'Billed', cell: (r) => formatRs(r.billedPaisa) },
                { key: 'l', header: 'Left', cell: (r) => formatRs(r.leftPaisa) },
              ]}
            />
          )}
        </div>
      )}
    </Loaded>
  );
}

function CheckTab() {
  const q = useQuery({ queryKey: ['ops', 'data-check'], queryFn: () => get<{ checkedInvoices: number; problems: { check: string; record: string; detail: string }[] }>('/ops/data-check') });
  return (
    <Loaded q={q}>
      {(d) => (d.problems.length === 0 ? (
        <EmptyState title="Sab kuch saaf hai" hint={`${d.checkedInvoices} invoices check hui.`} />
      ) : (
        <DataTable
          rows={d.problems}
          rowKey={(r) => `${r.check}:${r.record}`}
          columns={[
            { key: 'c', header: 'Check', cell: (r) => <span className="font-semibold">{r.check}</span> },
            { key: 'r', header: 'Record', cell: (r) => r.record },
            { key: 'd', header: 'Detail', cell: (r) => r.detail },
          ]}
        />
      ))}
    </Loaded>
  );
}

function SpendCell({ campaign, month, value }: { campaign: string; month: string; value: number }) {
  const [text, setText] = React.useState(String(value / 100));
  const save = useAct(() => put('/ops/campaigns', { campaign, month, spendPaisa: rupeesToPaisa(text) ?? 0 }), 'Spend save ho gaya');
  return (
    <div className="flex items-center gap-2">
      <Input aria-label={`Spend for ${campaign}`} className="w-28" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      <Button size="sm" variant="secondary" disabled={rupeesToPaisa(text) === null} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
    </div>
  );
}

function CampaignsTab({ month }: { month: string }) {
  const q = useQuery({ queryKey: ['ops', 'campaigns', month], queryFn: () => get<{ items: { campaign: string; spendPaisa: number; leads: number; booked: number; costPerLeadPaisa: number; revenuePaisa: number; returnBp: number | null }[] }>('/ops/campaigns', { month }) });
  return (
    <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Koi campaign nahi">
      {(d) => (
        <DataTable
          rows={d.items}
          rowKey={(r) => r.campaign}
          columns={[
            { key: 'c', header: 'Campaign', cell: (r) => <span className="font-semibold">{r.campaign}</span> },
            { key: 's', header: 'Spend (Rs)', cell: (r) => <SpendCell key={`${month}:${r.spendPaisa}`} campaign={r.campaign} month={month} value={r.spendPaisa} /> },
            { key: 'l', header: 'Leads', cell: (r) => r.leads },
            { key: 'p', header: 'Cost per lead', cell: (r) => formatRs(r.costPerLeadPaisa) },
            { key: 'b', header: 'Booked', cell: (r) => r.booked },
            { key: 'r', header: 'Revenue', cell: (r) => formatRs(r.revenuePaisa) },
            { key: 'x', header: 'Return', cell: (r) => (r.returnBp === null ? '—' : `${(r.returnBp / 10_000).toFixed(1)}×`) },
          ]}
        />
      )}
    </Loaded>
  );
}

type FinanceTab = 'pnl' | 'expenses' | 'ledger' | 'payroll' | 'costs' | 'campaigns' | 'check';

export function FinancePage() {
  const [tab, setTab] = React.useState<FinanceTab>('pnl');
  const [month, setMonth] = React.useState(thisMonth());
  return (
    <div className="space-y-3">
      <div className="print:hidden space-y-3">
        <PageHeader label="Owners only" title="Finance" />
        <Segmented<FinanceTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pnl', label: 'Profit & Loss' },
            { value: 'expenses', label: 'Expenses' },
            { value: 'ledger', label: 'Doctor Ledger' },
            { value: 'payroll', label: 'Payroll' },
            { value: 'costs', label: 'Procedure Costs' },
            { value: 'campaigns', label: 'Campaigns' },
            { value: 'check', label: 'Data Check' },
          ]}
        />
        {tab !== 'check' && <MonthField value={month} onChange={setMonth} />}
      </div>
      {tab === 'pnl' && <PnlTab month={month} />}
      {tab === 'expenses' && <ExpensesTab month={month} />}
      {tab === 'ledger' && <LedgerTab month={month} />}
      {tab === 'payroll' && <PayrollTab month={month} />}
      {tab === 'costs' && <CostsTab month={month} />}
      {tab === 'campaigns' && <CampaignsTab month={month} />}
      {tab === 'check' && <CheckTab />}
    </div>
  );
}
