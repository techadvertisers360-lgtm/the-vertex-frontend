import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Spec §24 screens in a real browser: permission denied, and a lost response that must not lose the form or duplicate. */
interface State {
  password: string;
  lead: { email: string };
  doctor: { name: string };
  retryLeadId: string;
  retryPatientName: string;
  otherLeadId: string;
  otherLeadName: string;
}
const S = (): State => JSON.parse(readFileSync(resolve(__dirname, '.state.json'), 'utf8'));
const DENIED = 'Aap ko is screen ki ijazat nahi hai.';

async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email, phone ya Member ID').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

test('§24 permission denied: another role’s screen and another member’s lead show no data, only the access message', async ({ browser }) => {
  const s = S();
  const lead = await signIn(browser, s.lead.email, s.password);

  await lead.goto('/manager');
  await expect(lead.getByText(DENIED).first()).toBeVisible();
  await lead.waitForURL((u) => u.pathname.startsWith('/lead'));

  await lead.goto(`/lead/leads/${s.otherLeadId}`);
  await expect(lead.getByText(DENIED).first()).toBeVisible();
  await expect(lead.getByText(s.otherLeadName)).toHaveCount(0);
  await lead.context().close();
});

test('§24 no network / timeout: the booking form is kept, Retry re-sends with the same key, only one appointment is made', async ({ browser }) => {
  const s = S();
  const lead = await signIn(browser, s.lead.email, s.password);
  await lead.goto(`/lead/leads/${s.retryLeadId}`);
  await lead.getByRole('button', { name: 'Book appointment' }).click();
  const dialog = lead.getByRole('dialog');
  const name = dialog.getByLabel('Patient name');
  if (!(await name.inputValue())) await name.fill(s.retryPatientName);
  await dialog.getByLabel('Reason / service detail').fill('E2E retry check');
  await dialog.getByLabel('Doctor').selectOption({ label: s.doctor.name });
  await dialog.getByRole('listbox', { name: 'Available slots' }).getByRole('option').first().click();

  // The server saves the booking, but the response never reaches the browser (connection drops).
  let attempts = 0;
  await lead.route('**/api/lead/leads/*/book', async (route) => {
    attempts++;
    if (attempts === 1) {
      await route.fetch();
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: /^Confirm/ }).click();
  const retry = dialog.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  await expect(dialog.getByLabel('Reason / service detail')).toHaveValue('E2E retry check'); // nothing typed is lost

  await retry.click();
  await expect(lead.getByText(/Appointment confirm/)).toBeVisible();
  expect(attempts).toBe(2);

  // Exactly one appointment exists for this patient (the retry replayed the first save).
  const res = await lead.request.get('/api/lead/appointments?bucket=total', { headers: { 'x-vh-client': 'web' } });
  const body = (await res.json()) as { items: { patient?: { name: string }; patientName?: string }[] };
  const mine = body.items.filter((a) => (a.patient?.name ?? a.patientName) === s.retryPatientName);
  expect(mine).toHaveLength(1);
  await lead.context().close();
});
