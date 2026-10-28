'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogIn, LogOut } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatTime } from '@/lib/time';
import { Button } from '@/components/ui/button';

/**
 * Check-in / check-out in the header for every staff role (D-051) — before, only Reception, Assistant and Office Boy
 * had it (on their Staff Actions page). Not for the MD or the developer, not while viewing as someone, and not for
 * people whose check-in the developer switched off (D-049). Role-specific check-out gates stay on the server.
 */
export function HeaderAttendance() {
  const { me } = useSession();
  const show = !me.viewAs && me.user.role !== 'DEVELOPER' && me.user.role !== 'MD' && me.user.attendanceRequired !== false;
  const qc = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);
  const q = useQuery({ queryKey: ['attendance', 'today'], queryFn: () => get<{ attendance: { checkInAt: string; checkOutAt: string | null } | null }>('/attendance/today'), enabled: show });
  const act = useMutation({
    mutationFn: (kind: 'check-in' | 'check-out') => post(`/attendance/${kind}`),
    onSuccess: (_d, kind) => {
      toast.success(kind === 'check-in' ? 'Check-in ho gaya' : 'Check-out ho gaya');
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ['attendance'] });
      void qc.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Nahi hua — dobara koshish karein'),
  });
  if (!show || !q.data) return null;
  const a = q.data.attendance;
  if (!a)
    return (
      <Button size="sm" variant="secondary" loading={act.isPending} onClick={() => act.mutate('check-in')} title="Aaj ki attendance">
        <LogIn className="size-4" /> <span className="hidden sm:inline">Check-in</span>
      </Button>
    );
  if (a.checkOutAt)
    return (
      <span className="hidden text-[12px] text-on-brand-muted md:inline" title="Aaj ki attendance">
        {formatTime(a.checkInAt)}–{formatTime(a.checkOutAt)}
      </span>
    );
  return (
    <Button
      size="sm"
      variant="onBrand"
      loading={act.isPending}
      onClick={() => (confirming ? act.mutate('check-out') : setConfirming(true))}
      onBlur={() => setConfirming(false)}
      title={`On duty since ${formatTime(a.checkInAt)} — check-out ke liye dabayein`}
    >
      <LogOut className="size-4" /> <span className={confirming ? 'inline' : 'hidden sm:inline'}>{confirming ? 'Pakka check-out?' : 'Check-out'}</span>
      <span className="hidden text-[12px] text-on-brand-muted lg:inline">· {formatTime(a.checkInAt)}</span>
    </Button>
  );
}
