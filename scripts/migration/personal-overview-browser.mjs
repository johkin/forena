import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origins = [process.env.FORENA_PARITY_NEXT ?? 'http://127.0.0.1:3004', process.env.FORENA_PARITY_VITE ?? 'http://127.0.0.1:3005'];
for (const origin of origins) assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
});
await mkdir('frontend/.evidence/personal-overview', { recursive: true });
try {
  for (const width of [320, 390, 768, 1280]) {
    const layouts = [];
    for (const [index, origin] of origins.entries()) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/components`);
      if (index === 0) await page.addStyleTag({ content: 'nextjs-portal { display:none !important; }' });
      const home = page.getByRole('region', { name: 'Min översikt – interaktivt exempel', exact: true });
      const rows = home.locator('.personal-calendar-section .personal-activity-row');
      const filters = home.getByRole('group', { name: 'Filtrera på lag', exact: true });
      const reply = home.getByRole('button', { name: /^Behöver svar/ });
      await expect(rows).toHaveCount(2);
      await expect(reply).toHaveText('Behöver svar (1)');
      await page.evaluate(() => document.fonts.ready);
      layouts.push(await home.evaluate(element => {
        const origin = element.getBoundingClientRect();
        const rounded = value => Math.round(value * 100) / 100;
        return [element, ...element.querySelectorAll('*')].map(child => {
          const rect = child.getBoundingClientRect();
          const style = getComputedStyle(child);
          return { tag: child.tagName, x: rect.width || rect.height ? rounded(rect.x - origin.x) : 0, y: rect.width || rect.height ? rounded(rect.y - origin.y) : 0,
            width: rounded(rect.width), height: rounded(rect.height), font: style.font,
            color: style.color, background: style.backgroundColor, border: style.border, padding: style.padding };
        });
      }));
      await home.screenshot({ path: `frontend/.evidence/personal-overview/${index}-${width}.png`, animations: 'disabled' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await filters.getByRole('button', { name: 'Exempelföreningen · Testlaget', exact: true }).click();
      await expect(rows).toHaveCount(1);
      await expect(reply).toHaveText('Behöver svar (0)');
      await reply.focus();
      await page.keyboard.press('Enter');
      await expect(reply).toHaveAttribute('aria-pressed', 'true');
      await expect(rows).toHaveCount(0);
      await expect(home.getByText('Alla aktuella kallelser i urvalet är besvarade.', { exact: true })).toBeVisible();
      await filters.getByRole('button', { name: 'Alla lag', exact: true }).click();
      await expect(rows).toHaveCount(1);
      await expect(rows.getByRole('button', { name: /Träning F2016/ })).toHaveCount(1);
      await home.getByRole('button', { name: 'Kalender', exact: true }).click();
      await expect(home.getByRole('button', { name: /Träning F2016.*Exempelföreningen/ })).toHaveCount(1);
      await expect(home.getByRole('button', { name: /Spela mera.*Exempelföreningen/ })).toHaveCount(0);
      await home.getByRole('button', { name: 'Agenda', exact: true }).click();
      await expect(reply).toHaveAttribute('aria-pressed', 'true');
      for (const name of ['Johan Exempel', 'Johan Andersson', 'Tilda Exempel', 'Alex Exempel', 'Alex Ekblad']) {
        await rows.getByRole('button', { name: `Kommer: ${name}`, exact: true }).click();
      }
      await expect(reply).toHaveText('Behöver svar (0)');
      await expect(rows).toHaveCount(0);
      await reply.click();
      await expect(rows).toHaveCount(2);
      await expect(rows.getByRole('button', { name: 'Kommer: Tilda Exempel', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const edit = page.locator('#activity-management-example .activity-details').getByRole('button', { name: 'Redigera', exact: true });
      await expect(edit.locator('svg')).toHaveCount(1);
      const box = await edit.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      await edit.click();
      await expect(page.getByRole('dialog', { name: 'Redigera aktivitet', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(edit).toBeFocused();
      assert.deepEqual(errors, []);
      await page.close();
    }
    assert.deepEqual(layouts[0], layouts[1], `personal overview layout/styles differ at ${width}px`);
    console.log(`PASS ${width}px: Next/Vite rendering, combined filters, calendar, answers, empty state, edit icon, keyboard, overflow`);
  }
} finally { await browser.close(); }
