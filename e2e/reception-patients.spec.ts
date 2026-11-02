import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** D-087: Reception → Patients lists every patient without searching; Open History shows the full record, view only. */
const S = (): { password: string; reception: { email: string } } => JSON.parse(readFileSync(resolve(__dirname, '.state.json'), 'utf8'));

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`reception patient list and history on ${label}`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport })).newPage();
    await page.goto('/login');
    await page.getByLabel('Email, phone ya Member ID').fill(S().reception.email);
    await page.getByLabel('Password').fill(S().password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));

    await page.goto('/reception/patients');
    // The list is there before anything is typed.
    const history = page.getByRole('link', { name: /^Open History: / });
    await expect(history.first()).toBeVisible();
    await expect(page.getByText(/^\d+ patients$/)).toBeVisible();
    await expect(page.getByText('Patient chunein')).toHaveCount(0);

    await history.first().click();
    await page.waitForURL(/\/reception\/patients\/[^/?]+$/);
    await expect(page.getByText('Patient record (view only)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0);

    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);

    await page.getByRole('link', { name: 'Patients', exact: true }).last().click();
    await page.waitForURL('**/reception/patients');
    await expect(history.first()).toBeVisible();
  });
}
