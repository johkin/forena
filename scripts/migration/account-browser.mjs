import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { layoutSnapshot } from './ui-parity-layout.mjs';

const origins = [process.env.FORENA_PARITY_NEXT ?? 'http://localhost:3004', process.env.FORENA_PARITY_VITE ?? 'http://localhost:3000'];
for (const origin of origins) assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.FORENA_BROWSER_EXECUTABLE ?? '/usr/bin/chromium' });
await mkdir('frontend/.evidence/account', { recursive: true });
try {
  for (const width of [390, 1280]) {
    const layouts = [];
    for (const [index, origin] of origins.entries()) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/components`);
      const example = page.locator('#account-example');
      const profile = example.locator('.profile-card').filter({ has: page.getByRole('heading', { name: 'Mitt konto', exact: true }) });
      await expect(profile.getByLabel('Visningsnamn')).toHaveValue('Kim Andersson');
      await page.evaluate(() => document.fonts.ready);
      layouts.push(await layoutSnapshot(profile));
      await profile.screenshot({ path: `frontend/.evidence/account/${index}-${width}.png` });
      await profile.getByLabel('Visningsnamn').fill('Ändrat exempel');
      await profile.getByRole('button', { name: 'Spara profil', exact: true }).click();
      await expect(profile.getByRole('status').filter({ hasText: 'Profilen har sparats' })).toBeVisible();
      await profile.getByRole('button', { name: 'Spara profil', exact: true }).click();
      await expect(profile.getByRole('button', { name: 'Spara profil', exact: true })).toBeEnabled();
      const child = profile.locator('article').filter({ has: page.getByRole('heading', { name: 'Sam Andersson', exact: true }) }).first();
      await child.getByRole('button', { name: 'Redigera barnets uppgifter', exact: true }).click();
      await expect(child.getByLabel('Kontaktadress (e-post)')).toBeVisible();
      await expect(child.getByRole('group', { name: 'Födelsedatum' })).toBeVisible();
      await child.getByRole('button', { name: 'Avbryt', exact: true }).click();
      await child.getByRole('button', { name: 'Visa ändringshistorik' }).click();
      await expect(child.getByText('Telefon: 0700000000 → 0701234567')).toBeVisible();
      await example.getByLabel('Kontoläge').selectOption('conflict');
      await profile.getByLabel('Visningsnamn').fill('Utkast att behålla');
      await profile.getByRole('button', { name: 'Spara profil', exact: true }).click();
      await expect(profile.getByRole('alert')).toContainText(/utkast/);
      await expect(profile.getByLabel('Visningsnamn')).toHaveValue('Utkast att behålla');
      await profile.getByRole('button', { name: 'Läs in aktuella uppgifter' }).click();
      await expect(profile.getByLabel('Visningsnamn')).toHaveValue('Utkast att behålla');
      for (const mode of ['deletion', 'empty', 'loading', 'error']) {
        await example.getByLabel('Kontoläge').selectOption(mode);
        if (mode === 'deletion') await expect(profile.getByRole('alert')).toContainText('2026');
        if (mode === 'empty') await expect(profile.getByText('Du har inga aktiva klubbkopplingar.')).toBeVisible();
        if (mode === 'loading') await expect(profile.getByRole('status')).toHaveText('Hämtar ditt konto…');
        if (mode === 'error') await expect(profile.getByRole('alert')).toContainText('kunde inte hämtas');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}`);
      assert.deepEqual(errors, []);
      await page.close();
    }
    assert.deepEqual(layouts[0], layouts[1], `Shared account layout differs at ${width}px`);
  }
  console.log('Account profile verified in Next and Vite at 390px and 1280px: layout, saving, child editor/history, retained drafts, loading/error, grace and pending activation.');
} finally { await browser.close(); }
