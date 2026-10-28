'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogIn, LogOut, Star } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { formatTime } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Notice } from '@/components/ui/form';
import { useSession } from '@/lib/session';

interface Review {
  id: string;
  uniformOk: boolean;
  hairOk: boolean;
  nailsOk: boolean;
  rating: number;
  comment: string | null;
  improvementNote: string | null;
  createdAt: string;
}

interface Attendance {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
}

/** Own check-in / check-out (spec §9, §12, §13). Role-specific check-out gates are enforced by the server. */
export function AttendanceCard() {
  const { me } = useSession();
  // Switched off for this person by the developer (D-049): no check-in / check-out needed.
  if (me.user.attendanceRequired === false) return null;
  return <AttendanceCardInner />;
}

function AttendanceCardInner() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attendance', 'today'], queryFn: () => get<{ attendance: Attendance | null }>('/attendance/today') });
  const act = useMutation({
    mutationFn: (kind: 'check-in' | 'check-out') => post(`/attendance/${kind}`),
    onSuccess: (_d, kind) => {
      toast.success(kind === 'check-in' ? 'Check-in ho gaya — Manager ko notice gaya' : 'Check-out ho gaya');
      void qc.invalidateQueries({ queryKey: ['attendance'] });
      // Role dashboards (Assistant tasks, Office Boy rounds) depend on attendance.
      void qc.invalidateQueries({ queryKey: ['queue'] });
    },
  });
  const a = q.data?.attendance;
  // Manager's arrival review for today — visible only to this staff member (spec §14).
  const reviews = useQuery({ queryKey: ['attendance', 'reviews'], queryFn: () => get<{ items: Review[] }>('/attendance/reviews'), enabled: !!a });
  const todayReview = reviews.data?.items.find((r) => a && new Date(r.createdAt) >= new Date(a.checkInAt));
  return (
    <Card accent="ops">
      <CardHeader>
        <CardTitle>Aaj ki attendance</CardTitle>
        {a ? <Chip tone={a.checkOutAt ? 'neutral' : 'success'}>{a.checkOutAt ? 'Checked out' : 'On duty'}</Chip> : <Chip tone="warning">Not checked in</Chip>}
      </CardHeader>
      <p className="mb-3 text-dense text-muted">
        {a ? `Check-in ${formatTime(a.checkInAt)}${a.checkOutAt ? ` · Check-out ${formatTime(a.checkOutAt)}` : ''}` : 'Shift shuru karne ke liye check-in karein.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act.mutate('check-in')} disabled={!!a} loading={act.isPending && act.variables === 'check-in'}>
          <LogIn className="size-4" /> Check-in
        </Button>
        <Button variant="secondary" onClick={() => act.mutate('check-out')} disabled={!a || !!a.checkOutAt} loading={act.isPending && act.variables === 'check-out'}>
          <LogOut className="size-4" /> Check-out
        </Button>
      </div>
      {todayReview && (
        <div className="mt-3 rounded-control border border-line bg-canvas px-3 py-2 text-dense">
          <p className="flex items-center gap-1 font-semibold text-ink">
            <Star className="size-4 fill-gold text-gold" /> Manager review: {todayReview.rating}/5
            {!todayReview.uniformOk || !todayReview.hairOk || !todayReview.nailsOk
              ? ` · dhyan dein: ${[!todayReview.uniformOk && 'uniform', !todayReview.hairOk && 'hair', !todayReview.nailsOk && 'nails'].filter(Boolean).join(', ')}`
              : ''}
          </p>
          {todayReview.comment && <p className="text-muted">{todayReview.comment}</p>}
          {todayReview.improvementNote && <p className="text-ink">Improvement: {todayReview.improvementNote}</p>}
        </div>
      )}
      {act.error && (
        <div className="mt-3">
          <Notice tone="warning">{act.error instanceof ApiError ? act.error.message : 'Kuch ghalat ho gaya'}</Notice>
        </div>
      )}
    </Card>
  );
}
