import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origins = (process.env.FORENA_EVALUATION_ORIGINS ?? 'http://127.0.0.1:3000,http://127.0.0.1:3001').split(',');
for (const origin of origins) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
});
await mkdir('frontend/.evidence/evaluation', { recursive: true });
try {
  for (const origin of origins) for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/components`);
    const example = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Spelarutvärdering och gemensamma tilläggsvyer', exact: true }) }).first();
    await expect(example.getByRole('heading', { name: 'Aktuella betyg', exact: true })).toBeVisible();
    await expect(example.getByRole('rowheader', { name: 'Robin Exempel', exact: true })).toBeVisible();
    await expect(example.getByRole('spinbutton', { name: 'Robin Exempel: Spelförståelse' })).toHaveValue('6');
    await example.getByRole('button', { name: 'Gruppförslag', exact: true }).click();
    await expect(example.getByText('Kan prova nästa förmågegrupp – ledaren beslutar', { exact: true })).toBeVisible();
    await expect(example.getByRole('columnheader', { name: 'Utveckling' })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${origin} ${width}`);
    await example.screenshot({ path: `frontend/.evidence/evaluation/${new URL(origin).port}-${width}.png` });
    await example.getByLabel('Exempeltillstånd').selectOption('matrix');
    const scoreRegion = example.getByRole('region', { name: 'Redigera spelarvärden', exact: true });
    await expect(scoreRegion.getByRole('rowheader')).toHaveCount(3);
    await expect(scoreRegion.getByRole('columnheader')).toHaveCount(5);
    await expect(scoreRegion.getByRole('spinbutton')).toHaveCount(12);
    const saved = scoreRegion.getByRole('spinbutton', { name: 'Robin Exempel: Spelförståelse', exact: true });
    await saved.fill('');
    assert.equal(await saved.evaluate(input => input.validity.valueMissing), true, 'saved scores cannot be cleared');
    await saved.fill('6');
    await saved.focus();
    await page.keyboard.press('Tab');
    await expect(scoreRegion.getByRole('spinbutton', { name: 'Robin Exempel: Spelteknik', exact: true })).toBeFocused();
    if (width < 640) {
      const name = scoreRegion.getByRole('rowheader').first();
      const left = await name.evaluate(element => element.getBoundingClientRect().left);
      await scoreRegion.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      assert.ok(Math.abs(await name.evaluate(element => element.getBoundingClientRect().left) - left) < 1, 'player names stay visible while scrolling');
      await scoreRegion.evaluate(element => { element.scrollLeft = 0; });
    }
    await example.getByText('Mätpunkter och regler', { exact: true }).click();
    const metricRows = example.locator('.evaluation-metric-row');
    await expect(metricRows).toHaveCount(4);
    for (const row of await metricRows.all()) {
      const name = await row.getByRole('textbox').boundingBox();
      const kind = await row.getByRole('combobox').boundingBox();
      assert.ok(name && kind && name.height >= 44 && kind.height >= 44);
      if (width >= 640) assert.ok(kind.x >= name.x + name.width, 'name and type occupy separate columns');
      else assert.ok(kind.y >= name.y + name.height, 'name and type stack on mobile');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `matrix/configuration overflow ${origin} ${width}`);
    await example.screenshot({ path: `frontend/.evidence/evaluation/${new URL(origin).port}-matrix-${width}.png` });
    await example.getByLabel('Exempeltillstånd').selectOption('conflict');
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
