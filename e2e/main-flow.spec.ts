import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Main clinic flow across five roles in real browsers (spec §7, §9, §10, §12, §25):
 * Lead booking → Reception check-in → Doctor plan → Assistant procedure → invoice close.
 */
interface State {
  tag: string;
  password: string;
  lead: { email: string };
  reception: { email: string };
  doctor: { email: string; name: string };
  assistant: { email: string; name: string };
  leadId: string;
  patientName: string;
}
const S = (): State => JSON.parse(readFileSync(resolve(__dirname, '.state.json'), 'utf8'));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Email, phone ya Member ID').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

async function upload(page: Page, route: string, name: string) {
  await page.locator(`input[type=file][data-upload-route="${route}"]`).setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
}

test('Lead booking → Reception check-in → Doctor plan → Assistant procedure → invoice close', async ({ browser }) => {
  const s = S();

  // 1. Lead member books a consultation for their lead
  const lead = await signIn(browser, s.lead.email, s.password);
  await lead.goto(`/lead/leads/${s.leadId}`);
  await lead.getByRole('button', { name: 'Book appointment' }).click();
  const dialog = lead.getByRole('dialog');
  const name = dialog.getByLabel('Patient name');
  if (!(await name.inputValue())) await name.fill(s.patientName);
  await dialog.getByLabel('Doctor').selectOption({ label: s.doctor.name });
  await dialog.getByRole('listbox', { name: 'Available slots' }).getByRole('option').first().click();
  await dialog.getByRole('button', { name: /^Confirm/ }).click();
  await expect(lead.getByText(/Appointment confirm/)).toBeVisible();
  await lead.context().close();

  // 2. Reception checks the patient in and skips vitals
  const rec = await signIn(browser, s.reception.email, s.password);
  await rec.goto('/reception');
  await rec.getByLabel('Patient / phone').fill(s.patientName);
  const row = rec.getByRole('row', { name: new RegExp(s.patientName) });
  await row.getByRole('button', { name: 'Check-in' }).click();
  const vitals = rec.getByRole('dialog', { name: 'Vitals' });
  // Check-in opens the vitals dialog itself; open it from the row only if it did not appear.
  if (!(await vitals.waitFor({ timeout: 5000 }).then(() => true, () => false))) await row.getByRole('button', { name: 'Vitals' }).click();
  await vitals.getByRole('button', { name: 'Skip vitals' }).click();
  await expect(row.getByText('Waiting')).toBeVisible();

  // 3. Doctor accepts, saves a plan with one same-day procedure, sends the patient to Reception
  const doc = await signIn(browser, s.doctor.email, s.password);
  await doc.goto('/doctor');
  await doc.getByRole('button', { name: 'Accept' }).first().click();
  await doc.waitForURL(/\/doctor\/consult\//); // Accept opens the consultation
  await doc.getByLabel('Consultation reason / findings').fill('E2E: acne scars — one laser session today');
  await doc.getByLabel('Consultation fee (Rs)').fill('2000');
  await doc.getByRole('button', { name: 'Add item' }).click();
  await doc.getByLabel('Name').last().fill('Laser session');
  await doc.getByLabel('Price (Rs)').last().fill('5000');
  await doc.getByLabel('Advance requested (Rs)').fill('7000');
  await doc.getByRole('button', { name: 'Save plan' }).click();
  await doc.getByRole('button', { name: 'Send to Reception' }).click();
  await expect(doc.getByText(/Reception/).first()).toBeVisible();

  // 4. Reception takes the advance and assigns the Assistant + procedure room
  await rec.reload();
  await rec.getByLabel('Patient / phone').fill(s.patientName);
  await rec.getByRole('row', { name: new RegExp(s.patientName) }).getByRole('link', { name: 'Billing' }).click();
  await rec.getByRole('button', { name: 'Full balance' }).click();
  await rec.getByRole('button', { name: 'Receive payment' }).click();
  await expect(rec.getByText(/receipt/i).first()).toBeVisible();
  await rec.getByRole('button', { name: 'Assign Assistant + room' }).click();
  const assign = rec.getByRole('dialog');
  await assign.getByRole('button', { name: new RegExp(s.assistant.name.replace(/[()]/g, '.')) }).click();
  await assign.getByRole('button', { name: 'Assign' }).click();
  await expect(rec.getByText(/Room P0/).first()).toBeVisible();

  // 5. Assistant runs the procedure: consent → photos (refused, with reason) → start/finish → no items → send → clean
  const asst = await signIn(browser, s.assistant.email, s.password);
  await asst.goto('/assistant');
  await asst.getByRole('link', { name: 'Open & accept' }).first().click();
  await asst.getByRole('button', { name: 'Accept procedure' }).click();
  await upload(asst, 'consentForm', 'consent.png');
  for (const which of ['Before', 'After'] as const) {
    if (which === 'After') {
      await asst.getByRole('button', { name: 'Start procedure' }).click();
      await asst.getByRole('button', { name: 'Finish procedure' }).click();
    }
    await expect(asst.getByText(`Step: ${which} photo`)).toBeVisible();
    await asst.getByRole('checkbox', { name: 'Patient ne photo se inkar kiya' }).check();
    await asst.getByLabel('Wajah').fill(`${which} photo: patient refused (E2E)`);
    await asst.getByRole('button', { name: 'Skip with reason' }).click();
  }
  await asst.getByRole('checkbox', { name: 'Is procedure mein koi stock item istemal nahi hua' }).check();
  await asst.getByRole('button', { name: 'Save items used' }).click();
  await asst.getByRole('button', { name: 'Send to Reception' }).click();
  await upload(asst, 'roomCleanPhoto', 'clean.png');
  await expect(asst.getByText(/done|complete/i).first()).toBeVisible();

  // 6. Reception: prescription photo, feedback skipped, invoice closed → Patient Done
  await rec.reload();
  const close = rec.getByRole('button', { name: 'Close invoice' });
  await expect(close).toBeDisabled(); // §24: no prescription photo yet
  await upload(rec, 'prescriptionPhoto', 'prescription.png');
  await rec.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(close).toBeEnabled();
  await close.click();
  await expect(rec.getByText(/Patient Done/).first()).toBeVisible();
});
