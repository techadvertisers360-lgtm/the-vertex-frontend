import { PageHeader } from '@/components/ui/card';
import { LeadershipPerformance } from '@/components/leadership/performance';

export default function Page() {
  return (
    <div className="space-y-4">
      <PageHeader label="Muaz Tahir" title="Performance" />
      <LeadershipPerformance canSendNote />
    </div>
  );
}
