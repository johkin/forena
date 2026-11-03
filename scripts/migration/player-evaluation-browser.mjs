import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origins = (process.env.FORENA_EVALUATION_ORIGINS ?? 'http://127.0.0.1:3000,http://127.0.0.1:3001').split(',');
for (const origin of origins) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.FORENA_BROWSER_EXECUTABLE ?? '/usr/bin/chromium' });
await mkdir('frontend/.evidence/evaluation', { recursive: true });
try {
  for (const origin of origins) for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/components`);
    const example = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Spelarutvärdering och gemensamma tilläggsvyer', exact: true }) }).first();
    await expect(example.getByRole('heading', { name: 'Aktuella betyg', exact: true })).toBeVisible();
    await example.getByText('Robin Exempel', { exact: true }).first().click();
    await expect(example.getByRole('spinbutton', { name: 'Robin Exempel: Spelförståelse' })).toHaveValue('6');
    await example.getByRole('button', { name: 'Gruppförslag', exact: true }).click();
    await expect(example.getByText('Kan prova nästa förmågegrupp – ledaren beslutar', { exact: true })).toBeVisible();
    await expect(example.getByRole('columnheader', { name: 'Utveckling' })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${origin} ${width}`);
    await example.screenshot({ path: `frontend/.evidence/evaluation/${new URL(origin).port}-${width}.png` });
    await example.getByLabel('Exempeltillstånd').selectOption('conflict');
    await example.getByText('Robin Exempel', { exact: true }).first().click();
    const input = example.getByRole('spinbutton', { name: 'Robin Exempel: Spelförståelse' });
    await input.fill('8');
    await example.getByRole('button', { name: 'Spara betyg', exact: true }).click();
    await expect(example.getByRole('alert')).toContainText('Ditt utkast finns kvar');
    await expect(input).toHaveValue('8');
    await example.getByLabel('Exempeltillstånd').selectOption('leader');
    await expect(example.getByRole('heading', { name: 'Aktuella betyg', exact: true })).toBeVisible();
    await expect(example.getByText('Mätpunkter och regler', { exact: true })).toHaveCount(0);
    await example.getByLabel('Exempeltillstånd').selectOption('disabled');
    await expect(example.getByRole('button', { name: 'Aktivera spelarutvärdering' })).toBeVisible();
    await example.getByRole('button', { name: 'Aktivera spelarutvärdering' }).click();
    await example.getByText('Mätpunkter och regler', { exact: true }).click();
    page.once('dialog', dialog => dialog.dismiss());
    await example.getByRole('button', { name: 'Stäng av och radera utvärderingsdata' }).click();
    await expect(example.getByRole('heading', { name: 'Aktuella betyg', exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await example.getByRole('button', { name: 'Stäng av och radera utvärderingsdata' }).click();
    await expect(example.getByRole('button', { name: 'Aktivera spelarutvärdering' })).toBeVisible();
    await example.getByLabel('Exempeltillstånd').selectOption('unknown');
    await expect(example.getByText('Det här tillägget kan inte visas med den aktuella versionen.')).toBeVisible();
    await example.getByLabel('Exempeltillstånd').selectOption('error');
    await expect(example.getByRole('alert')).toContainText('kunde inte hämtas');
    await example.getByLabel('Exempeltillstånd').selectOption('loading');
    await expect(example.getByRole('status')).toContainText('Laddar spelarutvärdering');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${origin} ${width}px: views, scores, preserved conflict draft, roles, activation, confirmation, unknown version, error and loading`);
  }
} finally { await browser.close(); }
