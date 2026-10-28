import { PageHeader } from '@/components/ui/card';
import { MembersAdmin } from '@/components/leadership/lead-admin';

export default function Page() {
  return (
    <div className="space-y-4">
      <PageHeader label="Hamza Zafar" title="Lead Team members" />
      <MembersAdmin />
    </div>
  );
}
