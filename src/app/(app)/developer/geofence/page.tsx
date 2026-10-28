'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Search } from 'lucide-react';
import { ApiError, get, patch, post, put } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/links';
import { formatDateTime } from '@/lib/time';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

/**
 * Clinic location restriction (D-062), developer only: global on/off, clinic point, radius and clinic IPs, and a
 * per-user "Sirf clinic par chale" switch (default off). Changes apply on the user's next request. Audited.
 */
interface Config {
  enabled: boolean;
  latitude: number;
  longitude: number;
  radiusM: number;
  allowedIps: string[];
  updatedAt: string;
}
interface GeoUser {
  id: string;
  displayName: string;
  role: Role;
  memberCode: string | null;
  active: boolean;
  geofenceRequired: boolean;
  geoLastCheckAt: string | null;
  geoLastInside: boolean | null;
  geoLastDistanceM: number | null;
}
type Overview = { config: Config; users: GeoUser[] };

function SettingsCard({ config }: { config: Config }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ enabled: config.enabled, latitude: String(config.latitude), longitude: String(config.longitude), radiusM: String(config.radiusM), ips: config.allowedIps.join('\n') });
  const lat = Number(f.latitude);
  const lng = Number(f.longitude);
  const radius = Number(f.radiusM);
  const valid = f.latitude.trim() !== '' && f.longitude.trim() !== '' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Number.isInteger(radius) && radius >= 10 && radius <= 100_000;
  const m = useMutation({
    mutationFn: () => put('/developer/geofence', { enabled: f.enabled, latitude: lat, longitude: lng, radiusM: radius, allowedIps: f.ips.split(/[\s,]+/).filter(Boolean) }),
    onSuccess: () => {
      toast.success('Geofence settings save — foran lagu');
      void qc.invalidateQueries({ queryKey: ['developer', 'geofence'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        {config.enabled ? <Chip tone="success">On</Chip> : <Chip tone="neutral">Off</Chip>}
      </CardHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) m.mutate();
        }}
      >
        <Checkbox label="Geofence on (jin users ka switch on hai, woh sirf clinic par app chala sakein)" checked={f.enabled} onChange={(e) => setF((x) => ({ ...x, enabled: e.target.checked }))} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Latitude" required htmlFor="geo-lat">
            <Input id="geo-lat" inputMode="decimal" value={f.latitude} onChange={(e) => setF((x) => ({ ...x, latitude: e.target.value }))} />
          </Field>
          <Field label="Longitude" required htmlFor="geo-lng">
            <Input id="geo-lng" inputMode="decimal" value={f.longitude} onChange={(e) => setF((x) => ({ ...x, longitude: e.target.value }))} />
          </Field>
          <Field label="Radius (meter)" required htmlFor="geo-r" hint="10 se 100,000">
            <Input id="geo-r" inputMode="numeric" value={f.radiusM} onChange={(e) => setF((x) => ({ ...x, radiusM: e.target.value }))} />
          </Field>
        </div>
        <Field label="Clinic public IP addresses (optional)" htmlFor="geo-ips" hint="Har line par ek IP. In se aane wali request clinic par maani jati hai, location ke baghair bhi.">
          <Textarea id="geo-ips" rows={3} value={f.ips} onChange={(e) => setF((x) => ({ ...x, ips: e.target.value }))} placeholder="203.0.113.5" />
        </Field>
        <p className="text-[12px] text-muted">
          <a className="text-brand underline" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">
            <MapPin className="mr-1 inline size-3" aria-hidden />
            Map par dekhein
          </a>
          {config.updatedAt && new Date(config.updatedAt).getTime() > 0 ? ` · aakhri tabdeeli ${formatDateTime(config.updatedAt)}` : ' · abhi default values (save nahi hui)'}
        </p>
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
        <div className="flex justify-end">
          <Button type="submit" disabled={!valid} loading={m.isPending}>
            Save karein
          </Button>
        </div>
      </form>
    </Card>
  );
}

function lastCheck(u: GeoUser) {
  if (!u.geoLastCheckAt) return <span className="text-muted">—</span>;
  return (
    <span>
      <span className={u.geoLastInside ? 'text-success' : 'text-danger'}>{u.geoLastInside ? 'Clinic par' : 'Bahar'}</span>
      {u.geoLastDistanceM !== null && <span className="text-muted"> · {u.geoLastDistanceM} m</span>}
      <span className="block text-[12px] text-muted">{formatDateTime(u.geoLastCheckAt)}</span>
    </span>
  );
}

function UsersCard({ users, enabled }: { users: GeoUser[]; enabled: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = React.useState('');
  const [role, setRole] = React.useState<Role | ''>('');
  const done = () => void qc.invalidateQueries({ queryKey: ['developer', 'geofence'] });
  const one = useMutation({
    mutationFn: (v: { id: string; required: boolean }) => patch(`/developer/geofence/users/${v.id}`, { required: v.required }),
    onSuccess: done,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Nahi hua — dobara koshish karein'),
  });
  const bulk = useMutation({
    mutationFn: (required: boolean) => post<{ count: number }>('/developer/geofence/role', { role, required }),
    onSuccess: (r, required) => {
      toast.success(`${ROLE_LABEL[role as Role]}: ${r.count} users ${required ? 'on' : 'off'}`);
      done();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Nahi hua — dobara koshish karein'),
  });
  const roles = [...new Set(users.map((u) => u.role))];
  const needle = q.trim().toLowerCase();
  const shown = users.filter((u) => (!role || u.role === role) && (!needle || u.displayName.toLowerCase().includes(needle) || u.memberCode?.toLowerCase().includes(needle)));
  const onCount = users.filter((u) => u.geofenceRequired).length;
  return (
    <Card className="p-0 sm:p-0">
      <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
        <CardTitle className="mr-auto">
          Users <span className="ml-1 text-dense font-normal text-muted">{onCount} par switch on</span>
        </CardTitle>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam ya Member ID" aria-label="Search users" />
        </div>
        <Select className="w-full sm:w-44" value={role} onChange={(e) => setRole(e.target.value as Role | '')} aria-label="Role">
          <option value="">Sab roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </Select>
        {role && (
          <>
            <Button size="sm" variant="secondary" loading={bulk.isPending && bulk.variables === true} onClick={() => bulk.mutate(true)}>
              Is role ke sab on
            </Button>
            <Button size="sm" variant="ghost" loading={bulk.isPending && bulk.variables === false} onClick={() => bulk.mutate(false)}>
              Sab off
            </Button>
          </>
        )}
      </div>
      {!enabled && onCount > 0 && (
        <div className="px-4 pb-3 sm:px-5">
          <Notice tone="warning">Geofence abhi off hai — switch on hone ke bawajood kisi par pabandi nahi.</Notice>
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto border-t border-line">
        <table className="w-full text-dense">
          <thead>
            <tr className="text-left text-muted">
              <th className="sticky top-0 border-b border-line bg-canvas px-3 py-2.5 font-semibold">User</th>
              <th className="sticky top-0 border-b border-line bg-canvas px-3 py-2.5 font-semibold">Role</th>
              <th className="sticky top-0 border-b border-line bg-canvas px-3 py-2.5 font-semibold">Aakhri check</th>
              <th className="sticky top-0 border-b border-line bg-canvas px-3 py-2.5 font-semibold">Sirf clinic par chale</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className={cn('border-b border-line', !u.active && 'opacity-60')}>
                <td className="px-3 py-2">
                  <span className="font-semibold text-ink">{u.displayName}</span>
                  <span className="block text-[12px] text-muted">
                    {u.memberCode ?? '—'}
                    {!u.active && ' · disabled'}
                  </span>
                </td>
                <td className="px-3 py-2">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-3 py-2">{lastCheck(u)}</td>
                <td className="px-3 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      role="switch"
                      className="peer sr-only"
                      checked={u.geofenceRequired}
                      disabled={one.isPending && one.variables?.id === u.id}
                      onChange={(e) => one.mutate({ id: u.id, required: e.target.checked })}
                      aria-label={`${u.displayName}: sirf clinic par chale`}
                    />
                    <span className={cn('relative h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40', u.geofenceRequired ? 'bg-brand' : 'bg-line')}>
                      <span className={cn('absolute top-0.5 size-5 rounded-full bg-surface shadow-card transition-transform', u.geofenceRequired ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                    </span>
                    <span className={u.geofenceRequired ? 'font-semibold text-brand' : 'text-muted'}>{u.geofenceRequired ? 'On' : 'Off'}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function GeofencePage() {
  const q = useQuery({ queryKey: ['developer', 'geofence'], queryFn: () => get<Overview>('/developer/geofence') });
  return (
    <div className="space-y-4">
      <PageHeader label="Developer" title="Clinic location (geofence)" />
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-4">
            <SettingsCard key={d.config.updatedAt} config={d.config} />
            <UsersCard users={d.users} enabled={d.config.enabled} />
          </div>
        )}
      </QueryState>
    </div>
  );
}
