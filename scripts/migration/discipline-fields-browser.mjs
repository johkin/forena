import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origins = (process.env.FORENA_DISCIPLINE_ORIGINS ?? 'http://localhost:3000').split(',');
for (const origin of origins) assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
});
await mkdir('/tmp/forena-discipline-evidence', { recursive: true });
try {
  for (const [index, origin] of origins.entries()) {
    for (const width of [320, 390, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/components`);
      const section = page.locator('#extension-fields-example');
      await expect(section).toBeVisible({ timeout: 60000 });
      await section.scrollIntoViewIfNeeded();
      await section.getByRole('button', { name: 'Redigera spelaruppgifter' }).click();
      await section.getByLabel('Tröjnummer', { exact: true }).fill('12');
      await section.getByRole('button', { name: 'Spara', exact: true }).click();
      await expect(section.getByRole('status')).toHaveText('Sparat.');
      await expect(section.locator('dd').first()).toHaveText('12');
      await section.getByLabel('Fältläge').selectOption('reader');
      await expect(section.getByRole('button', { name: 'Redigera spelaruppgifter' })).toHaveCount(0);
      await section.getByLabel('Fältläge').selectOption('conflict');
      await section.getByRole('button', { name: 'Redigera spelaruppgifter' }).click();
      await section.getByLabel('Tröjnummer', { exact: true }).fill('99');
      await section.getByRole('button', { name: 'Spara', exact: true }).click();
      await expect(section.getByRole('alert')).toContainText('Ditt utkast finns kvar');
      await expect(section.getByLabel('Tröjnummer', { exact: true })).toHaveValue('99');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await section.screenshot({ path: `/tmp/forena-discipline-evidence/discipline-${index}-${width}.png` });
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`${origin} ${width}px: sparande, läsåtkomst, bevarat konfliktutkast och sidbredd OK`);
    }
  }
} finally {
  await browser.close();
}
