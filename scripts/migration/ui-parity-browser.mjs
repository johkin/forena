import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { assertSameRendering } from './ui-parity-images.mjs';
import { layoutSnapshot } from './ui-parity-layout.mjs';
import { assertLayoutSnapshotComparison } from './ui-parity-layout-checks.mjs';

const nextOrigin = process.env.FORENA_PARITY_NEXT ?? 'http://127.0.0.1:3004';
const viteOrigin = process.env.FORENA_PARITY_VITE ?? 'http://127.0.0.1:3005';
for (const value of [nextOrigin, viteOrigin]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(value).hostname));

const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
});
await mkdir('frontend/.evidence/parity', { recursive: true });
try {
  await assertLayoutSnapshotComparison(browser);
  for (const width of [320, 390, 768, 1280]) {
    const screenshots = [];
    const expandedScreenshots = [];
    const homes = [];
    const layouts = [];
    for (const [name, origin] of [['next', nextOrigin], ['vite', viteOrigin]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/components`);
      // Next's development badge is framework chrome, absent from production.
      if (name === 'next') await page.addStyleTag({ content: 'nextjs-portal { display:none !important; }' });
      const example = page.locator('#administration-example');
      await example.getByLabel('Administrationsläge', { exact: true }).selectOption('platform');
      const home = example.locator('.application-card').filter({ has: page.getByRole('heading', { name: 'Systemadministration', exact: true }) });
      await expect(home.getByRole('link')).toHaveCount(5);
      await page.evaluate(() => document.fonts.ready);
      const homeLayout = await layoutSnapshot(home);
      homes.push(await home.screenshot({ path: `frontend/.evidence/parity/system-${name}-${width}.png`, animations: 'disabled' }));
      // Compare the real shared editor, including its footer and recipient choices.
      await page.locator('#activity-management-example').getByRole('button', { name: 'Redigera', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Redigera aktivitet', exact: true });
      await expect(dialog.getByText('Kallelse & svarsregler', { exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Ställ in', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Välj personer', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const clock of await dialog.locator('.activity-time-value').all())
        assert.ok(await clock.evaluate(element => element.scrollWidth <= element.clientWidth), `clock value overflows at ${width}px`);
      for (const selector of ['.editor-section', '.editor-time-steppers', '.modal-actions', '.person-selection-row'])
        await expect(dialog.locator(selector).first()).toBeAttached();
      const editorLayout = await layoutSnapshot(dialog);
      screenshots.push(await dialog.screenshot({ path: `frontend/.evidence/parity/editor-${name}-${width}.png`, animations: 'disabled' }));
      const datePanel = dialog.locator('.activity-date-alternative');
      await expect(datePanel.locator('input')).toBeHidden();
      await datePanel.locator('summary').click();
      await expect(datePanel.locator('input')).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      layouts.push({ home: homeLayout, editor: editorLayout, editorWithDate: await layoutSnapshot(dialog) });
      expandedScreenshots.push(await dialog.screenshot({ path: `frontend/.evidence/parity/editor-date-${name}-${width}.png`, animations: 'disabled' }));
      await page.keyboard.press('Escape');
      await expect(page.locator('#activity-management-example').getByRole('button', { name: 'Redigera', exact: true })).toBeFocused();
      assert.deepEqual(errors, []);
      await page.close();
    }
    assert.deepEqual(layouts[0], layouts[1], `CSS or geometry differs at ${width}px`);
    assertSameRendering(homes[0], homes[1], `system overview at ${width}px`);
    assertSameRendering(screenshots[0], screenshots[1], `editor at ${width}px`);
    assertSameRendering(expandedScreenshots[0], expandedScreenshots[1], `editor with expanded date at ${width}px`);
    console.log(`PASS ${width}px: Next/Vite overview/editor pixels, styles, invitations, collapsed/expanded date, focus, overflow`);
  }
} finally { await browser.close(); }
