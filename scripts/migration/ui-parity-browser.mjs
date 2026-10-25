import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';

const nextOrigin = process.env.FORENA_PARITY_NEXT ?? 'http://127.0.0.1:3004';
const viteOrigin = process.env.FORENA_PARITY_VITE ?? 'http://127.0.0.1:3005';
for (const value of [nextOrigin, viteOrigin]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(value).hostname));
function sameRendering(left, right, label) {
  const a = PNG.sync.read(left), b = PNG.sync.read(right);
  assert.equal(a.width, b.width, `${label}: width differs`);
  assert.equal(a.height, b.height, `${label}: height differs`);
  let changed = 0;
  for (let offset = 0; offset < a.data.length; offset += 4)
    if (a.data.subarray(offset, offset + 4).compare(b.data.subarray(offset, offset + 4)) !== 0) changed++;
  // Cropping a fractional document coordinate can change a few edge pixels.
  // Keep geometry/CSS exact and allow only 0.01% antialiasing differences.
  assert.ok(changed <= a.width * a.height * 0.0001, `${label}: ${changed} pixels differ; compare frontend/.evidence/parity`);
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
});
await mkdir('frontend/.evidence/parity', { recursive: true });
try {
  for (const width of [320, 390, 768, 1280]) {
    const screenshots = [];
    const homes = [];
    const styles = [];
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
      homes.push(await home.screenshot({ path: `frontend/.evidence/parity/system-${name}-${width}.png`, animations: 'disabled' }));
      // Compare the real shared editor, including its footer and recipient choices.
      await page.locator('#activity-management-example').getByRole('button', { name: 'Redigera', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Redigera aktivitet', exact: true });
      await expect(dialog.getByText('Kallelse & svarsregler', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Välj personer', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const clock of await dialog.locator('.activity-time-value').all())
        assert.ok(await clock.evaluate(element => element.scrollWidth <= element.clientWidth), `clock value overflows at ${width}px`);
      styles.push(await dialog.evaluate(element => {
        const selectors = ['.editor-section', '.editor-time-steppers', '.modal-actions', '.person-selection-row'];
        return selectors.map(selector => {
          const child = element.querySelector(selector);
          if (!child) throw new Error(`Missing parity element: ${selector}`);
          const style = getComputedStyle(child);
          return { selector, display: style.display, padding: style.padding, gap: style.gap,
            borderRadius: style.borderRadius, fontSize: style.fontSize, background: style.backgroundColor,
            gridTemplateColumns: style.gridTemplateColumns };
        });
      }));
      screenshots.push(await dialog.screenshot({ path: `frontend/.evidence/parity/editor-${name}-${width}.png`, animations: 'disabled' }));
      await page.keyboard.press('Escape');
      await expect(page.locator('#activity-management-example').getByRole('button', { name: 'Redigera', exact: true })).toBeFocused();
      assert.deepEqual(errors, []);
      await page.close();
    }
    sameRendering(homes[0], homes[1], `system overview at ${width}px`);
    assert.deepEqual(styles[0], styles[1], `editor CSS differs at ${width}px`);
    sameRendering(screenshots[0], screenshots[1], `editor at ${width}px`);
    console.log(`PASS ${width}px: Next/Vite overview/editor pixels, styles, invitations, focus, overflow`);
  }
} finally { await browser.close(); }
