import { expect, test } from '@playwright/test';
import {
  expectWithinPixels,
  paneBox,
  parseView,
  pixelToComplex,
  urlParam,
  waitForRender,
} from './helpers';

test('dragging c on the Mandelbrot set drives the Julia set', async ({
  page,
}) => {
  await page.goto('/explore?m=-0.5,0,1.25&c=-0.5,0');
  await waitForRender(page, 'mandelbrot');
  await waitForRender(page, 'julia');
  const box = await paneBox(page, 'mandelbrot');
  const size = { width: box.width, height: box.height };
  const view = parseView((await urlParam(page, 'm'))!);
  // Marker position for c = -0.5 + 0i.
  const ps = (2 * view.r) / Math.min(size.width, size.height);
  const mx = size.width / 2 + (-0.5 - view.re) / ps;
  const my = size.height / 2;
  await page.mouse.move(box.x + mx, box.y + my);
  await page.mouse.down();
  await page.mouse.move(box.x + mx + 40, box.y + my - 60, { steps: 8 });
  await page.mouse.up();

  const expected = pixelToComplex(view, size, mx + 40, my - 60);
  const c = (await urlParam(page, 'c', '-0.5,0')).split(',').map(Number);
  expectWithinPixels({ re: c[0], im: c[1] }, expected, ps);
  // The view itself did not pan.
  expect(new URL(page.url()).searchParams.get('m')).toBe('-0.5,0,1.25');
  await waitForRender(page, 'julia');
  await expect(page.getByTestId('julia-probe')).toContainText(
    expected.re.toFixed(4).slice(0, 5).replace('-', '−'),
  );
});

test('follow mode moves c with the cursor', async ({ page }) => {
  await page.goto('/explore?follow=1&c=0,0');
  await waitForRender(page, 'mandelbrot');
  const box = await paneBox(page, 'mandelbrot');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.move(box.x + box.width * 0.3 + 5, box.y + box.height * 0.4);
  await urlParam(page, 'c', '0,0');
});

test('parameters can be typed in and presets applied', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/julia');
  if (!(await page.getByTestId('control-panel').isVisible()))
    await page.getByTestId('toggle-panel').click();
  const re = page.getByTestId('c-re');
  await re.fill('-0.12256116687665');
  await re.press('Enter');
  const im = page.getByTestId('c-im');
  await im.fill('0.74486176661974');
  await im.press('Enter');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('c'))
    .toBe('-0.12256116687665,0.74486176661974');
  await expect(page.getByTestId('julia-probe')).toContainText('is connected');

  await page.getByRole('button', { name: 'Places' }).click();
  await page.getByTestId('preset-cantor-dust').click();
  await expect(page).toHaveURL(/\/julia\?.*c=0\.36,0\.36/);
  await expect(page.getByTestId('julia-probe')).toContainText('Cantor set');
});
