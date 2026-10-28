import { PageHeader } from '@/components/ui/card';
import { LeadershipPerformance, PerformanceNotes } from '@/components/leadership/performance';

export default function Page() {
  return (
    <div className="space-y-4">
      <PageHeader label="Hamza Zafar" title="Lead Team performance" />
      <PerformanceNotes />
      <LeadershipPerformance />
    </div>
  );
}
