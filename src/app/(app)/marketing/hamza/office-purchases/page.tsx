import { OfficePurchasesPage } from '@/components/ops/desk-pages';

export default function Page() {
  return <OfficePurchasesPage canAsk={false} canDecide canSettle isOwner />;
}
