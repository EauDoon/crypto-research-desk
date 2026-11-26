import { readFile } from 'node:fs/promises';
import { test, expect, gotoOnce, checkAccessibility } from './harness.mjs';

test('workbench opens the route explorer without discarding the current packet', async ({ page }) => {
  await gotoOnce(page);
  const next = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Explore research routes', exact: false }).click();
  const atlas = await next;
  try {
    await expect(atlas.getByRole('heading', { name: 'Research routes', exact: true })).toBeVisible();
    await expect(atlas.locator('#geometry .node')).toHaveCount(8);
    await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
    await checkAccessibility(atlas);
  } finally {
    await atlas.close();
  }
});

test('inspect a handoff, follow its stage link and export only the selected route', async ({ page }) => {
  await gotoOnce(page, '/atlas.html#route=hunt&stage=scout');
  await expect(page.locator('#focus-name')).toHaveText('Opportunity scout');
  await expect(page.locator('#geometry .node')).toHaveCount(5);
  await page.locator('#handoffs').getByRole('link', { name: 'Chief’s draft' }).click();
  await expect(page.locator('#focus-name')).toHaveText('Chief’s draft');
  await expect(page.locator('#focus-name')).toBeFocused();
  await expect(page.locator('#permalink')).toHaveAttribute('href', '#route=hunt&stage=draft');
  await expect(page.locator('#source')).toHaveAttribute('href', /schemas\/chief\.schema\.json$/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download route JSON' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('research-route-hunt.json');
  const route = JSON.parse(await readFile(await download.path(), 'utf8')).data.researchRoute;
  expect(route.nodes.map(node => node.id)).toEqual(['intake', 'scout', 'draft', 'risk', 'brief']);
  expect(route.edges).toEqual([
    { from: 'intake', to: 'scout' }, { from: 'scout', to: 'draft' },
    { from: 'draft', to: 'risk' }, { from: 'risk', to: 'brief' },
  ]);
  await page.locator('#mode').selectOption('review');
  await expect(page.locator('#stage option')).toHaveCount(2);
  await expect(page.locator('#geometry line')).toHaveCount(1);
  await expect(page.locator('#focus-name')).toHaveText('Research question');
});

test('compact reduced-motion view supports keyboard controls and a readable directory', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoOnce(page, '/atlas.html#route=unknown&stage=missing');
  const selected = page.locator('#geometry .selected');
  const position = await selected.getAttribute('transform');
  await page.getByRole('button', { name: 'Rotate right' }).focus();
  await page.keyboard.press('Enter');
  await expect(selected).not.toHaveAttribute('transform', position);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(selected).toHaveAttribute('transform', position);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#stages li')).toHaveCount(8);
});

test('rotated phone labels stay within the map and each handoff follows the inspected stage', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await gotoOnce(page, '/atlas.html#route=full&stage=quant');
  await expect(page.locator('#geometry .edge.active')).toHaveCount(4);
  await expect(page.locator('#route-count')).toHaveText('8 stages · 9 handoffs');
  for (const direction of ['Rotate left', 'Rotate right']) {
    for (let step = 0; step < 5; step++) {
      await page.getByRole('button', { name: direction }).click();
      const problems = await page.locator('#plot').evaluate(plot => {
        const frame = plot.getBoundingClientRect();
        const bounds = [...plot.querySelectorAll('.node text')].map(text => text.getBoundingClientRect());
        return bounds.some((box, index) => box.left < frame.left || box.right > frame.right ||
          box.top < frame.top || box.bottom > frame.bottom || bounds.slice(index + 1).some(other =>
            Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1 &&
            Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1));
      });
      expect(problems).toBe(false);
    }
    await page.getByRole('button', { name: 'Reset view' }).click();
  }
  await page.getByRole('button', { name: 'Stage details for Quant comparison' }).click();
  await expect(page.locator('#focus-name')).toBeFocused();
  await page.locator('#mode').selectOption('review');
  await expect(page.locator('#route-count')).toHaveText('2 stages · 1 handoff');
  await expect(page.locator('#geometry .edge.active')).toHaveCount(1);
});

test.describe('static route reference', () => {
  test.use({ javaScriptEnabled: false });
  test('all four routes and eight source links are available without scripting', async ({ page }) => {
    await gotoOnce(page, '/atlas.html');
    await expect(page.locator('#explorer')).toBeHidden();
    await expect(page.locator('#routes dt')).toHaveCount(4);
    await expect(page.locator('#stages a')).toHaveCount(8);
    await expect(page.getByRole('link', { name: 'Independent risk source' })).toBeVisible();
  });
});

test.describe('touch camera controls', () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 800 } });
  test('first reset tap after a quick swipe activates once and a vertical swipe scrolls', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Trusted multi-event touch input uses Chromium CDP.');
    await gotoOnce(page, '/atlas.html');
    const session = await page.context().newCDPSession(page);
    const send = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const point = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function swipe(x, y, dx, dy) {
      await send('touchStart', point(x, y));
      for (let step = 1; step <= 4; step++) {
        await pause(16);
        await send('touchMove', point(x + dx * step / 4, y + dy * step / 4));
      }
      await send('touchEnd', []);
    }
    const plot = await page.locator('#plot').boundingBox();
    const reset = await page.locator('#reset').boundingBox();
    const selected = page.locator('.node.selected');
    const original = await selected.getAttribute('transform');
    await page.locator('#reset').evaluate(button => {
      button.dataset.clicks = '0';
      button.addEventListener('click', () => { button.dataset.clicks = String(Number(button.dataset.clicks) + 1); });
    });
    await swipe(plot.x + 40, plot.y + 90, 80, 0);
    await expect(selected).not.toHaveAttribute('transform', original);
    await pause(50);
    await page.touchscreen.tap(reset.x + reset.width / 2, reset.y + reset.height / 2);
    await expect(selected).toHaveAttribute('transform', original);
    await expect(page.locator('#reset')).toHaveAttribute('data-clicks', '1');
    await page.touchscreen.tap(reset.x + reset.width / 2, reset.y + reset.height / 2);
    await expect(page.locator('#reset')).toHaveAttribute('data-clicks', '2');
    await send('touchStart', point(reset.x + reset.width / 2, reset.y + reset.height / 2));
    await send('touchCancel', []);
    await expect(page.locator('#reset')).toHaveAttribute('data-clicks', '2');
    await swipe(plot.x + 75, plot.y + plot.height - 30, 0, -170);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(25);
  });
});
