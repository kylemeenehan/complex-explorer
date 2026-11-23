import { expect, test } from '@playwright/test';
import {
  expectWithinPixels,
  fractionMatching,
  paneBox,
  parseView,
  pixelToComplex,
  samplePixels,
  sampleGrid,
  urlParam,
  waitForRender,
} from './helpers';

test.describe('Mandelbrot navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/mandelbrot?m=-0.75,0.1,0.35&orbit=0');
    await waitForRender(page, 'mandelbrot');
  });

  test('dragging moves the picture exactly with the pointer', async ({
    page,
  }) => {
    const box = await paneBox(page, 'mandelbrot');
    const grid = sampleGrid(box.width, box.height);
    const before = await samplePixels(page, 'mandelbrot', grid);
    const [dx, dy] = [137, -61];
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(start.x + (dx * i) / 10, start.y + (dy * i) / 10);
    await page.mouse.up();

    const view = parseView(await urlParam(page, 'm', '-0.75,0.1,0.35'));
    const ps = (2 * 0.35) / Math.min(box.width, box.height);
    expectWithinPixels(view, { re: -0.75 - dx * ps, im: 0.1 + dy * ps }, ps);
    expect(view.r).toBe(0.35);

    await waitForRender(page, 'mandelbrot');
    const shifted = grid.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    const after = await samplePixels(page, 'mandelbrot', shifted);
    expect(fractionMatching(before, after)).toBeGreaterThan(0.97);
  });

  test('wheel zoom keeps the point under the cursor fixed', async ({
    page,
  }) => {
    const box = await paneBox(page, 'mandelbrot');
    // Chromium rounds mouse positions to whole pixels, so aim at one exactly.
    const cursor = {
      x: Math.round(box.x + box.width * 0.7) - box.x,
      y: Math.round(box.y + box.height * 0.3) - box.y,
    };
    const size = { width: box.width, height: box.height };
    const target = pixelToComplex(
      { re: -0.75, im: 0.1, r: 0.35 },
      size,
      cursor.x,
      cursor.y,
    );
    await page.mouse.move(box.x + cursor.x, box.y + cursor.y);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);

    const view = parseView(await urlParam(page, 'm', '-0.75,0.1,0.35'));
    expect(view.r).toBeCloseTo(0.35 / 4, 6); // 800px of scroll = 2 octaves
    const now = pixelToComplex(view, size, cursor.x, cursor.y);
    expectWithinPixels(
      now,
      target,
      (2 * view.r) / Math.min(size.width, size.height),
    );
  });

  test('keyboard and buttons navigate', async ({ page }) => {
    await page.getByTestId('mandelbrot').focus();
    await page.keyboard.press('+');
    const zoomed = parseView(await urlParam(page, 'm', '-0.75,0.1,0.35'));
    expect(zoomed.r).toBeCloseTo(0.35 / 1.5, 6);
    await page.getByRole('button', { name: 'Reset view (0)' }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('m'))
      .toBe('-0.5,0,1.25');
  });

  test('clicking sets c and reports membership', async ({ page }) => {
    const box = await paneBox(page, 'mandelbrot');
    // Click the centre of the view, c = -0.75 + 0.1i (outside M: Seahorse Valley).
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const c = (await urlParam(page, 'c', '-0.8,0.156')).split(',').map(Number);
    expect(c[0]).toBeCloseTo(-0.75, 6);
    expect(c[1]).toBeCloseTo(0.1, 6);
    await expect(page.getByTestId('mandelbrot-probe-status')).toContainText(
      'not in the Mandelbrot set',
    );
    // The centre of the main cardioid is in M.
    await page.goto('/mandelbrot?m=0,0,1&c=0,0');
    await expect(page.getByTestId('mandelbrot-probe-status')).toContainText(
      'attracting fixed point',
    );
  });
});

test('a shared link reproduces the same picture', async ({ page, browser }) => {
  await page.goto('/mandelbrot?orbit=0');
  await waitForRender(page, 'mandelbrot');
  const box = await paneBox(page, 'mandelbrot');
  await page.mouse.move(box.x + 300, box.y + 250);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -120);
  await page.mouse.move(box.x + 500, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 350, { steps: 5 });
  await page.mouse.up();
  await urlParam(page, 'm', '-0.5,0,1.25');
  await page.waitForTimeout(400); // let the debounced URL catch the final view
  const url = page.url();
  await waitForRender(page, 'mandelbrot');
  const grid = sampleGrid(box.width, box.height);
  const original = await samplePixels(page, 'mandelbrot', grid);

  const other = await browser.newPage({ viewport: page.viewportSize()! });
  await other.goto(url);
  await waitForRender(other, 'mandelbrot');
  const copy = await samplePixels(other, 'mandelbrot', grid);
  expect(fractionMatching(original, copy, 2)).toBeGreaterThan(0.99);
  await other.close();
});
