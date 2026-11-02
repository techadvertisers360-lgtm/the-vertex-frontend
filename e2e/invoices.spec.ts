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

test('create, pay later, overpay into an advance, print, and cancel', async ({ browser }) => {
  const s = S();
  const tag = `E2E Inv ${Date.now()}`;
  const rec = await signIn(browser, s.reception.email);
  await rec.goto('/reception/invoices');
  await rec.getByRole('link', { name: 'Add Invoice' }).click();
  await rec.waitForURL('**/reception/invoices/new');

  // a new patient, then two lines of our own with an editable price
  await rec.getByRole('button', { name: 'Naya' }).click();
  const dialog = rec.getByRole('dialog');
  await dialog.getByLabel('Naam').fill(tag);
  await dialog.getByLabel('Phone').fill(`0300${String(Date.now()).slice(-7)}`);
  await dialog.getByRole('button', { name: 'Patient save karein' }).click();
  await expect(rec.getByText(tag)).toBeVisible();
  await rec.getByRole('button', { name: 'Apni line add karein' }).click();
  await rec.getByLabel('Service 1', { exact: true }).fill('Consultation');
  await rec.getByLabel('Price (Rs)').first().fill('5000');
  await rec.getByRole('button', { name: 'Apni line add karein' }).click();
  await rec.getByLabel('Service 2', { exact: true }).fill('Injection');
  await rec.getByLabel('Price (Rs)').nth(1).fill('2000');
  await rec.getByLabel('Discount (Rs)').fill('1000');

  // Balance is worked out as you type: 7000 - 1000 - 2000
  await rec.getByLabel('Payment mode').selectOption({ label: 'Cash' });
  await rec.getByLabel('Amount paid now (Rs)').fill('2000');
  const totals = rec.locator('dl').filter({ hasText: 'Sub Total' });
  await expect(totals).toContainText('Rs 7,000');
  await expect(totals).toContainText('Rs 6,000');
  await expect(totals).toContainText('Rs 4,000');
  await expect(totals).toContainText('N/A');
  await shot(rec, 'form-desktop');

  await rec.getByRole('button', { name: /Invoice save karein/ }).click();
  await rec.waitForURL(/\/reception\/invoices\/(?!new)[^/]+$/);
  await expect(rec.getByText('Rs 4,000').first()).toBeVisible();
  await expect(rec.getByRole('button', { name: 'Invoice cancel karein' })).toHaveCount(0); // Reception cannot cancel
  await expect(rec.getByRole('button', { name: 'Send via SMS / WhatsApp' })).toBeDisabled();
  await shot(rec, 'detail-reception');
  const url = new URL(rec.url()).pathname;
  const invoiceId = url.split('/').pop()!;

  // pay more than the balance: refused until the extra is saved as an advance
  await rec.getByRole('button', { name: 'Payment lein' }).click();
  const pay = rec.getByRole('dialog');
  await pay.getByLabel('Payment mode').selectOption({ label: 'Cash' });
  await pay.getByLabel('Amount (Rs)').fill('4500');
  await expect(pay.getByRole('button', { name: 'Payment save karein' })).toBeDisabled();
  await pay.getByLabel(/advance mein save karein/).check();
  await pay.getByRole('button', { name: 'Payment save karein' }).click();
  await expect(rec.getByText('Patient ka advance')).toBeVisible();
  await expect(rec.getByText('Rs 500', { exact: true }).first()).toBeVisible();
  await expect(rec.getByText('Closed')).toBeVisible();

  // printing: A4 and thermal; the shell does not print
  for (const size of ['a4', 'thermal']) {
    await rec.goto(`${url}/print?size=${size}`);
    const paper = rec.getByTestId('invoice-print');
    await expect(paper).toContainText('The Vertex Health');
    await expect(paper).toContainText('Consultation');
    await expect(paper).toContainText('Rs 6,000');
    await rec.emulateMedia({ media: 'print' });
    await expect(rec.getByRole('button', { name: 'Print' })).toBeHidden();
    await expect(rec.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await shot(rec, `print-${size}`);
    await rec.emulateMedia({ media: 'screen' });
  }

  // the list finds it, with the balance gone
  await rec.goto('/reception/invoices');
  await rec.getByLabel('Search').fill(tag);
  await expect(rec.getByRole('link', { name: tag }).first()).toBeVisible();

  // Manager cancels with a reason and moves the money to the advance
  const mgr = await signIn(browser, s.manager.email);
  await mgr.goto(`/manager/invoices/${invoiceId}`);
  await mgr.getByRole('button', { name: 'Invoice cancel karein' }).click();
  const cancel = mgr.getByRole('dialog');
  await expect(cancel.getByRole('button', { name: 'Cancel karein' })).toBeDisabled();
  await cancel.getByLabel('Wajah').fill('E2E wrong invoice');
  await cancel.getByLabel(/advance mein rakhein/).check();
  await cancel.getByRole('button', { name: 'Cancel karein' }).click();
  await expect(mgr.getByText(/Wajah: E2E wrong invoice/)).toBeVisible();
  await shot(mgr, 'detail-cancelled');
  await mgr.goto('/manager/invoices');
  await mgr.getByLabel('Search').fill(tag);
  await expect(mgr.getByText('Cancelled').first()).toBeVisible();

  // MD sees who did what
  const md = await signIn(browser, s.md.email);
  await md.goto(`/md/invoices/${invoiceId}`);
  await expect(md.getByText('Invoice Cancelled')).toBeVisible();
  await expect(md.getByText('Invoice Created')).toBeVisible();

  // phone
  const phone = await signIn(browser, s.reception.email, { width: 390, height: 844 });
  await phone.goto('/reception/invoices/new');
  await expect(phone.getByRole('heading', { name: 'Service list' })).toBeVisible();
  await fitsWidth(phone);
  await shot(phone, 'form-phone');
  await phone.goto(url);
  await expect(phone.getByRole('heading', { name: 'Payments' })).toBeVisible();
  await fitsWidth(phone);
});
