import { CsvImport } from '@/components/developer/csv-import';

export default function Page() {
  return <CsvImport title="Procedures / Services import" kinds={['SERVICE']} />;
}
