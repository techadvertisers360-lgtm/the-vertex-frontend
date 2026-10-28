import { CsvImport } from '@/components/developer/csv-import';

export default function Page() {
  return <CsvImport title="Stock CSV import" kinds={['PROCEDURE', 'PHARMACY']} />;
}
