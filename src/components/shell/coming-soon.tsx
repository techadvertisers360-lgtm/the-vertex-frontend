'use client';
import { HeroBanner, Card, SectionLabel } from '@/components/ui/card';
import { useSession } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/links';

/** Placeholder for role areas whose screens arrive in a later phase (shell, nav and live notifications already work). */
export function ComingSoon({ phase, scope }: { phase: string; scope: string }) {
  const { me } = useSession();
  return (
    <div className="space-y-4">
      <HeroBanner label={ROLE_LABEL[me.user.role]} title={`Welcome, ${me.user.displayName}`} subtitle={`Is role ki screens ${phase} mein aa rahi hain.`} />
      <Card accent="ops">
        <SectionLabel>Planned</SectionLabel>
        <p className="mt-1 text-body text-ink">{scope}</p>
        <p className="mt-2 text-dense text-muted">Notifications rail aur live updates abhi bhi kaam kar rahe hain.</p>
      </Card>
    </div>
  );
}
