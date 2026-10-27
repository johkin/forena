import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { layoutSnapshot } from './ui-parity-layout.mjs';

/** Exercise browser layout history without depending on either application. */
export async function assertLayoutSnapshotComparison(browser) {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <main>
        <details open>
          <summary>Options</summary>
          <details>
            <summary>Alternative date</summary>
            <label style="display:grid;grid-template-columns:minmax(0,1fr) 170px;width:516px;height:44px">
              Date<input type="date">
            </label>
          </details>
        </details>
      </main>
    `);
    const root = page.locator('main');
    const summary = page.getByText('Alternative date', { exact: true });
    const input = page.locator('input');
    await expect(input).toBeHidden();
    const fresh = await layoutSnapshot(root);

    await summary.click();
    await expect(input).toBeVisible();
    const expanded = await layoutSnapshot(root);
    assert.notDeepEqual(expanded, fresh, 'opening a disclosure must change its snapshot');

    await summary.click();
    await expect(input).toBeHidden();
    assert.deepEqual(await layoutSnapshot(root), fresh,
      'a closed disclosure must not depend on its cached expanded layout');

    await page.locator('label').evaluate(label => { label.style.color = 'red'; });
    assert.notDeepEqual(await layoutSnapshot(root), fresh,
      'styles inside a closed disclosure must still be compared');
    await page.locator('label').evaluate(label => { label.style.color = ''; });
    await page.locator('label').evaluate(label => { label.style.width = '520px'; });
    assert.notDeepEqual(await layoutSnapshot(root), fresh,
      'size rules inside a closed disclosure must still be compared');
    await page.locator('label').evaluate(label => { label.style.width = '516px'; });

    await summary.click();
    await expect(input).toBeVisible();
    assert.deepEqual(await layoutSnapshot(root), expanded);
    await page.locator('label').evaluate(label => { label.style.width = '520px'; });
    assert.notDeepEqual(await layoutSnapshot(root), expanded,
      'geometry changes in an expanded disclosure must still fail comparison');
    console.log('PASS layout comparison: cached closed content, disclosure state, hidden styles and expanded geometry');
  } finally {
    await page.close();
  }
}
