import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** D-089 / D-090: every new screen opens for the right role with no error, on desktop and phone; the main actions work. */
interface State {
  password: string;
  reception: { email: string };
  manager: { email: string };
  md: { email: string };
  doctor: { email: string };
  assistant: { email: string };
}
const S = (): State => JSON.parse(readFileSync(resolve(__dirname, '.state.json'), 'utf8'));

async function signIn(browser: Browser, email: string, viewport = { width: 1440, height: 900 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto('/login');
  await page.getByLabel('Email, phone ya Member ID').fill(email);
  await page.getByLabel('Password').fill(S().password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

/** The screen rendered its heading, shows no error box, and does not scroll sideways. */
async function opens(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading, exact: true }).first(), path).toBeVisible();
  await expect(page.getByText('Aap ko is screen ki ijazat nahi hai.')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('alert').filter({ hasText: /ghalat|ijazat|Network/ })).toHaveCount(0);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
}

const SCREENS: { who: keyof Omit<State, 'password'>; path: string; heading: string }[] = [
  { who: 'reception', path: '/reception/plans', heading: 'Treatment Plans' },
  { who: 'reception', path: '/reception/requests', heading: 'Requests & Returns' },
  { who: 'reception', path: '/reception/handover', heading: 'Cash Handover' },
  { who: 'reception', path: '/reception/packages', heading: 'Packages & Memberships' },
  { who: 'reception', path: '/reception/office-purchases', heading: 'Office Purchases' },
  { who: 'reception', path: '/reception/documents', heading: 'Documents' },
  { who: 'reception', path: '/reception/chat', heading: 'Chat' },
  { who: 'manager', path: '/manager/clinic-now', heading: 'Clinic Now' },
  { who: 'manager', path: '/manager/requests-returns', heading: 'Requests & Returns' },
  { who: 'manager', path: '/manager/orders', heading: 'Purchase Orders' },
  { who: 'manager', path: '/manager/office-purchases', heading: 'Office Purchases' },
  { who: 'manager', path: '/manager/kits', heading: 'Kits, Rooms & Departments' },
  { who: 'md', path: '/md/clinic-now', heading: 'Clinic Now' },
  { who: 'md', path: '/md/finance', heading: 'Finance' },
  { who: 'md', path: '/md/documents', heading: 'Documents' },
  { who: 'doctor', path: '/doctor/share', heading: 'My Share' },
  { who: 'doctor', path: '/doctor/requests', heading: 'Part Payment Requests' },
  { who: 'assistant', path: '/assistant/chat', heading: 'Chat' },
  { who: 'assistant', path: '/assistant/outside', heading: 'Leave and requests' },
  { who: 'reception', path: '/reception/outside', heading: 'Leave and requests' },
  { who: 'reception', path: '/reception/orders', heading: 'Purchase Orders' },
  { who: 'manager', path: '/manager/doctors', heading: 'Doctor Ledger' },
  { who: 'manager', path: '/manager/feedback', heading: 'Patient Feedback' },
  { who: 'doctor', path: '/doctor/plans', heading: 'Treatment Plans' },
  { who: 'md', path: '/md/orders', heading: 'Purchase Orders' },
];

for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`every new screen opens on ${label}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const pages = new Map<string, Page>();
    for (const s of SCREENS) {
      if (!pages.has(s.who)) pages.set(s.who, await signIn(browser, S()[s.who].email, viewport));
      await opens(pages.get(s.who)!, s.path, s.heading);
    }
  });
}

test('MD: finance tabs open, and an expense is saved once', async ({ browser }) => {
  const md = await signIn(browser, S().md.email);
  await md.goto('/md/finance');
  for (const tab of ['Expenses', 'Doctor Ledger', 'Payroll', 'Procedure Costs', 'Campaigns', 'Patient Feedback', 'Lowest Prices', 'Data Check', 'Profit & Loss']) {
    await md.getByRole('tab', { name: tab }).click();
    await md.waitForLoadState('networkidle');
    await expect(md.getByRole('alert').filter({ hasText: /ghalat|ijazat|Network/ })).toHaveCount(0);
  }
  await md.getByRole('tab', { name: 'Expenses' }).click();
  const what = `E2E bill ${Date.now()}`;
  await md.getByLabel('What was it for').fill(what);
  await md.getByLabel('Amount (Rs)').fill('1500');
  await md.getByRole('button', { name: 'Save expense' }).click();
  await expect(md.getByText(what).first()).toBeVisible();
  await md.getByLabel('What was it for').fill(what);
  await md.getByLabel('Amount (Rs)').fill('1500');
  await md.getByRole('button', { name: 'Save expense' }).click();
  await expect(md.getByText('pehle se save hai')).toBeVisible();
});

test('Reception cannot open owner money; the API refuses it as well', async ({ browser }) => {
  const rec = await signIn(browser, S().reception.email);
  await rec.goto('/md/finance');
  await rec.waitForURL((u) => u.pathname.startsWith('/reception'));
  const status = await rec.evaluate(async () => (await fetch('/api/ops/profit-loss', { headers: { 'X-Requested-With': 'fetch' } })).status);
  expect(status).toBe(403);
});

test('chat: a message reaches the other person in the same room', async ({ browser }) => {
  const text = `Salam ${Date.now()}`;
  const rec = await signIn(browser, S().reception.email);
  await rec.goto('/reception/chat');
  await rec.getByRole('tab', { name: 'Reception and Manager' }).click();
  await rec.getByLabel('Write a message').fill(text);
  await rec.getByRole('button', { name: 'Send' }).click();
  await expect(rec.getByText(text)).toBeVisible();
  const mgr = await signIn(browser, S().manager.email);
  await mgr.goto('/manager/chat');
  await mgr.getByRole('tab', { name: 'Reception and Manager' }).click();
  await expect(mgr.getByText(text)).toBeVisible();
});

test('package: Manager adds a type and it can be chosen', async ({ browser }) => {
  const name = `E2E pack ${Date.now()}`;
  const mgr = await signIn(browser, S().manager.email);
  await mgr.goto('/manager/packages');
  await mgr.getByLabel('Naam').fill(name);
  await mgr.getByLabel('Sessions').fill('2');
  await mgr.getByLabel('Price (Rs)').fill('5000');
  await mgr.getByRole('button', { name: 'Save type' }).click();
  await expect(mgr.getByRole('option', { name: new RegExp(name) })).toHaveCount(1);
});
