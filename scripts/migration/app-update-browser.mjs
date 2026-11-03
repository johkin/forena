import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Run against production builds so both applications have their real build IDs.
const origins = (process.env.FORENA_APP_UPDATE_ORIGINS ?? 'http://127.0.0.1:3000,http://127.0.0.1:3001').split(',');
for (const origin of origins) assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
});
const hour = 60 * 60_000;
const noticeSelector = 'body > .app-update-notice, #root > .app-update-notice';
try {
  for (const origin of origins) for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const response = await context.request.get(`${origin}/app-version.json`);
      const { version: currentVersion } = await response.json();
      assert.equal(typeof currentVersion, 'string');
      let reportedVersion = currentVersion;
      let versionReads = 0;
      await context.route('**/app-version.json', route => {
        versionReads++;
        return route.fulfill({ json: { version: reportedVersion } });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let documentLoads = 0;
      page.on('request', request => {
        if (request.isNavigationRequest() && request.resourceType() === 'document') documentLoads++;
      });
      await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
      await page.goto(`${origin}/components`);
      const notice = page.locator(noticeSelector);
      const example = page.locator('#app-update-example');
      await expect(example).toBeVisible();
      await expect.poll(() => versionReads).toBe(1);
      await expect(notice).toHaveCount(0);
      // Unchanged frontend version, regardless of backend state, never notifies.
      await page.clock.fastForward(5 * 60_000);
      await expect.poll(() => versionReads).toBe(2);
      await expect(notice).toHaveCount(0);
      const input = page.locator('input[type="email"]').first();
      await input.fill('ongoing-work@example.invalid');
      await input.focus();
      reportedVersion = 'new-frontend-build';
      await page.clock.fastForward(5 * 60_000);
      await expect(notice).toBeVisible();
      await expect(input).toBeFocused();
      await expect(input).toHaveValue('ongoing-work@example.invalid');
      await expect(notice.getByRole('status')).toHaveText('En ny version av Förena finns.');
      const bounds = await notice.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      await notice.getByRole('button', { name: 'Stäng påminnelsen' }).click();
      await expect(notice).toHaveCount(0);
      const secondTab = await context.newPage();
      await secondTab.goto(`${origin}/components`);
      await expect(secondTab.locator(noticeSelector)).toBeVisible();
      await secondTab.close();
      await expect(notice).toHaveCount(0);
      await page.clock.fastForward(hour - 1);
      await expect(notice).toHaveCount(0);
      await page.clock.fastForward(1);
      await expect(notice).toBeVisible();
      await notice.getByRole('button', { name: 'Stäng påminnelsen' }).click();
      await page.clock.fastForward(hour - 1);
      await expect(notice).toHaveCount(0);
      await page.clock.fastForward(1);
      await expect(notice).toBeVisible();
      await expect(input).toHaveValue('ongoing-work@example.invalid');
      assert.equal(documentLoads, 1, 'no automatic reload or reload on dismiss');
      // A suspended background timer must not extend the deadline after resume.
      await notice.getByRole('button', { name: 'Stäng påminnelsen' }).click();
      await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + hour));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect(notice).toBeVisible();
      // Navigation without reloading preserves the dismissal in the app root.
      await notice.getByRole('button', { name: 'Stäng påminnelsen' }).click();
      const isNext = await page.locator('script[src^="/_next/"]').count() > 0;
      if (isNext) {
        // The legacy shell uses full-page anchors; exercise same-document
        // navigation without needing its unrelated Supabase login setup.
        await page.evaluate(() => history.pushState(null, '', '/components?version-example=1'));
      } else {
        await page.getByRole('link', { name: 'Logga in', exact: true }).first().click();
        await expect(page).toHaveURL(`${origin}/login`);
      }
      const reloadAddress = page.url();
      await expect(notice).toHaveCount(0);
      await page.clock.fastForward(hour);
      await expect(notice).toBeVisible();
      reportedVersion = currentVersion;
      await notice.getByRole('button', { name: 'Ladda om', exact: true }).click();
      await page.waitForLoadState('networkidle');
      await expect(notice).toHaveCount(0);
      assert.equal(documentLoads, 2, 'explicit reload reloads the current address');
      assert.equal(page.url(), reloadAddress);
      await page.clock.fastForward(hour);
      await expect(notice).toHaveCount(0);
      // Gallery states use the production view without actually reloading.
      await page.goto(`${origin}/components`);
      await example.getByRole('button', { name: 'Stäng påminnelsen' }).click();
      await expect(example.getByRole('status')).toContainText('återkommer efter en timme');
      await example.getByRole('button', { name: 'Visa nästa påminnelse' }).click();
      await example.getByRole('button', { name: 'Ladda om', exact: true }).click();
      await expect(example.getByRole('status')).toContainText('Aktuell version är laddad');
      assert.deepEqual(errors, []);
      console.log(`${origin} ${width}px: detection, form/focus, dismiss, repeated hour, per-tab wait, resume, navigation, reload and gallery OK`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
