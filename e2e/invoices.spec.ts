import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** D-084 invoice screens in a real browser, for each role and on phone, tablet and desktop. */
interface State {
  password: string;
  reception: { email: string };
  manager: { email: string };
  md: { email: string };
}
const S = (): State => JSON.parse(readFileSync(resolve(__dirname, '.state.json'), 'utf8'));

/** Set E2E_SHOTS to a folder to keep screenshots of each screen. */
const SHOTS = process.env.E2E_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true });
};

async function signIn(browser: Browser, email: string, viewport = { width: 1440, height: 900 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport, acceptDownloads: true })).newPage();
  await page.goto('/login');
  await page.getByLabel('Email, phone ya Member ID').fill(email);
  await page.getByLabel('Password').fill(S().password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

/** No sideways page scroll on any screen size. */
async function fitsWidth(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test('list: each role sees the right buttons, totals and tabs, and it works on every screen size', async ({ browser }) => {
  const s = S();
  const rec = await signIn(browser, s.reception.email);
  await rec.getByRole('link', { name: 'Invoices', exact: true }).first().click();
  await rec.waitForURL('**/reception/invoices');
  await expect(rec.getByRole('heading', { name: 'Invoices' })).toBeVisible();
  await expect(rec.getByText('Total invoices')).toBeVisible();
  await expect(rec.getByText("This week's invoices")).toBeVisible();
  await expect(rec.getByRole('link', { name: 'Add Invoice' })).toBeVisible();
  await expect(rec.getByRole('button', { name: 'Export to Excel' })).toHaveCount(0);
  await expect(rec.getByRole('button', { name: 'Download all' })).toHaveCount(0);
  await expect(rec.getByText('Billed (filtered)')).toHaveCount(0);
  await shot(rec, 'list-reception-desktop');

  const mgr = await signIn(browser, s.manager.email);
  await mgr.goto('/manager/invoices');
  await expect(mgr.getByRole('button', { name: 'Export to Excel' })).toBeVisible();
  await expect(mgr.getByRole('button', { name: 'Export to PDF' })).toBeVisible();
  await expect(mgr.getByText('Billed (filtered)')).toBeVisible();
  await expect(mgr.getByRole('button', { name: 'Download all' })).toHaveCount(0);
  await shot(mgr, 'list-manager-desktop');

  const md = await signIn(browser, s.md.email);
  await md.goto('/md/invoices');
  await expect(md.getByRole('button', { name: 'Download all' })).toBeVisible();

  for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1100 }]] as const) {
    const p = await signIn(browser, s.manager.email, viewport);
    await p.goto('/manager/invoices');
    await expect(p.getByText('Total invoices')).toBeVisible();
    await fitsWidth(p);
    await shot(p, `list-manager-${name}`);
  }
});
