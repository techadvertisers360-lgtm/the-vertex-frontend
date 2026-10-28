import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Migrate the test DB (non-destructive) and seed a fresh E2E cast; logins go to e2e/.state.json (gitignored). */
export default function globalSetup() {
  const backend = resolve(__dirname, '../../backend');
  const env = readFileSync(resolve(backend, '.env'), 'utf8');
  const testDb = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL_TEST='))!.slice('DATABASE_URL_TEST='.length).replace(/^"|"$/g, '');
  const run = (cmd: string) => execSync(cmd, { cwd: backend, stdio: 'inherit', env: { ...process.env, DATABASE_URL: testDb, DATABASE_URL_TEST: testDb } });
  run('npx prisma migrate deploy');
  run(`npx tsx tests/e2e/seed.ts "${resolve(__dirname, '.state.json')}"`);
}
