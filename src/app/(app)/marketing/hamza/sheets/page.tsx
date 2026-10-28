import { PageHeader } from '@/components/ui/card';
import { SheetsAdmin } from '@/components/leadership/lead-admin';

export default function Page() {
  return (
    <div className="space-y-4">
      <PageHeader label="Hamza Zafar" title="Meta sheets" />
      <SheetsAdmin />
    </div>
  );
}
