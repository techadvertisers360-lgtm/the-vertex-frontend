import { PageHeader } from '@/components/ui/card';
import { OffersManager } from '@/components/leadership/marketing';

export default function Page() {
  return (
    <div className="space-y-4">
      <PageHeader label="Muaz Tahir" title="Creatives & offers" />
      <OffersManager />
    </div>
  );
}
