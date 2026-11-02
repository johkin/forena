import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const origins = [process.env.FORENA_PARITY_NEXT ?? 'http://127.0.0.1:3004', process.env.FORENA_PARITY_VITE ?? 'http://localhost:3000'];
for (const origin of origins) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}) });
try {
  for (const origin of origins) {
  for (const width of [320,390,1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/components`);
    await page.getByRole('button', { name: 'Öppna Träningsassistenten (exempel)', exact: true }).click();
    await page.getByLabel('Fråga assistenten', { exact: true }).last().fill('Skapa återkommande träning varje tisdag och torsdag');
    await page.getByRole('dialog').getByRole('button', { name: 'Skicka', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Skapa aktivitet', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Titel', { exact: true })).toHaveValue('Träning');
    await expect(editor.getByLabel('Plats', { exact: true })).toHaveValue('');
    await expect(editor.getByRole('button', { name: 'Träning', exact: true })).toHaveAttribute('aria-pressed', 'true');
    assert.ok(await editor.evaluate(element => element.contains(document.activeElement)));
    await expect(editor.getByRole('checkbox', { name: 'Tis', exact: true })).toBeChecked();
    await expect(editor.getByRole('checkbox', { name: 'Tor', exact: true })).toBeChecked();
    assert.ok(await page.evaluate(() => !document.querySelector('.floating-assistant-dialog')?.open));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${origin} ${width}px assistant message → recurring editor, prefill, single modal, no overflow`);
  }
  }
} finally { await browser.close(); }
