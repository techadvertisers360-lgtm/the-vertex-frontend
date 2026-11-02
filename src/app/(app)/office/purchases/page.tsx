import { OfficePurchasesPage } from '@/components/ops/desk-pages';

export default function Page() {
  return <OfficePurchasesPage canAsk canDecide={false} canSettle={false} isOwner={false} />;
}
