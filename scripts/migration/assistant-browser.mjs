import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origins = [process.env.FORENA_PARITY_NEXT ?? 'http://127.0.0.1:3004', process.env.FORENA_PARITY_VITE ?? 'http://localhost:3005'];
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
await mkdir('frontend/.evidence/assistant', { recursive: true });
try {
  for (const width of [320, 390, 768, 1280]) {
    const layouts = [];
    for (const [index, origin] of origins.entries()) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/components`);
      const conversation = page.locator('#assistant-conversation-example');
      await expect(conversation).toBeVisible();
      await expect(conversation.getByText('Träningen börjar klockan 17.00.', { exact: false })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`);
      await page.evaluate(() => document.fonts.ready);
      layouts.push(await conversation.evaluate(root => {
        const base = root.getBoundingClientRect();
        return [...root.querySelectorAll('article,input,select,button')].map(node => {
          const box = node.getBoundingClientRect();
          return { tag: node.tagName, x: Math.round(box.x-base.x), y: Math.round(box.y-base.y), width: Math.round(box.width), height: Math.round(box.height) };
        });
      }));
      await conversation.screenshot({ path: `frontend/.evidence/assistant/${index}-${width}.png` });
      await conversation.getByLabel('Fråga assistenten', { exact: true }).fill('När är nästa träning?');
      await conversation.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(conversation.getByText('Det här är ett lokalt exempel.', { exact: false })).toBeVisible();
      await conversation.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
      await expect(conversation.getByText('Det här är ett lokalt exempel.', { exact: false })).toHaveCount(0);
      const settings = page.locator('#assistant-settings-examples');
      await expect(settings.getByLabel('Assistentens namn')).toHaveValue('Klubbassistenten');
      await settings.getByLabel('Assistentens namn').fill('Ett långt namn för klubbens assistent');
      await settings.getByRole('button', { name: 'Spara assistentprofil', exact: true }).click();
      await expect(settings.getByText('Assistentprofilen är sparad.')).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await page.close();
    }
    assert.deepEqual(layouts[0], layouts[1], `Next/Vite shared conversation layout at ${width}px`);
    console.log(`PASS ${width}px: Next/Vite shared layout, conversation, streaming, new conversation, profile, overflow`);
  }
} finally { await browser.close(); }
