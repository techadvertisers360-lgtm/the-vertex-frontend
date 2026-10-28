import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * End-to-end tests (Phase 11). They never touch the dev database: an isolated stack is started on its own ports —
 *   API  :4100 → DATABASE_URL_TEST (backend/.env), no UploadThing token (dev upload stub)
 *   Web  :3100 → production build in .next-e2e (does not clash with `next dev` on :3000)
 * global-setup.ts seeds a fresh, clearly-labelled E2E cast in the test DB before the run.
 */
function backendEnv(key: string): string {
  const line = readFileSync(resolve(__dirname, '../backend/.env'), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing in backend/.env`);
  return line.slice(key.length + 1).replace(/^"|"$/g, '');
}

const TEST_DB = backendEnv('DATABASE_URL_TEST');
const API = 'http://localhost:4100';
const WEB = 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: WEB, trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 20_000, navigationTimeout: 60_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: resolve(__dirname, '../backend'),
      url: `${API}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { PORT: '4100', DATABASE_URL: TEST_DB, NODE_ENV: 'development', UPLOADTHING_TOKEN: '', FRONTEND_ORIGIN: WEB, PUBLIC_APP_URL: WEB, LOG_LEVEL: 'warn' },
    },
    {
      // E2E_SKIP_BUILD=1 reuses an existing .next-e2e build (faster reruns while writing tests)
      command: process.env.E2E_SKIP_BUILD ? 'npx next start -p 3100' : 'npx next build && npx next start -p 3100',
      url: `${WEB}/login`,
      timeout: 600_000,
      reuseExistingServer: false,
      env: { NEXT_DIST_DIR: '.next-e2e', BACKEND_URL: API, NEXT_PUBLIC_SOCKET_URL: API, NEXT_PUBLIC_REALTIME_PROVIDER: 'socketio', NEXT_PUBLIC_UPLOAD_STUB: '1', NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
