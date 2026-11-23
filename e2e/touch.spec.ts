import { expect, test, type Page } from '@playwright/test';
import {
  collapseProbe,
  expectWithinPixels,
  paneBox,
  parseView,
  pixelToComplex,
  urlParam,
  waitForRender,
} from './helpers';

type Pt = { x: number; y: number };

/** Multi-touch via the DevTools protocol (Playwright has no pinch API). */
async function touchGesture(page: Page, frames: Pt[][]) {
  const cdp = await page.context().newCDPSession(page);
  const points = (pts: Pt[]) => pts.map((p, id) => ({ x: p.x, y: p.y, id }));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points(frames[0]),
  });
  for (const f of frames.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(f),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

test('pinch zooms about the midpoint of the fingers', async ({ page }) => {
  await page.goto('/mandelbrot?m=-0.5,0,1.25&orbit=0');
  await waitForRender(page, 'mandelbrot');
  // Collapse the probe card so it doesn't intercept the touches.
  await collapseProbe(page, 'mandelbrot');
  const box = await paneBox(page, 'mandelbrot');
  const size = { width: box.width, height: box.height };
  const mid = { x: box.width / 2 + 20, y: box.height * 0.6 };
  const target = pixelToComplex(
    { re: -0.5, im: 0, r: 1.25 },
    size,
    mid.x,
    mid.y,
  );
  const frames: Pt[][] = [];
  for (let i = 0; i <= 10; i++) {
    const half = 40 + 4 * i; // finger separation 80 → 160: 2× zoom
    frames.push([
      { x: box.x + mid.x - half, y: box.y + mid.y },
      { x: box.x + mid.x + half, y: box.y + mid.y },
    ]);
  }
  await touchGesture(page, frames);
  const view = parseView(await urlParam(page, 'm', '-0.5,0,1.25'));
  expect(view.r).toBeCloseTo(1.25 / 2, 6);
  const now = pixelToComplex(view, size, mid.x, mid.y);
  expectWithinPixels(
    now,
    target,
    (2 * view.r) / Math.min(size.width, size.height),
    0.5,
  );
});

test('one-finger drag pans', async ({ page }) => {
  await page.goto('/mandelbrot?m=-0.5,0,1.25&orbit=0');
  await waitForRender(page, 'mandelbrot');
  await collapseProbe(page, 'mandelbrot');
  const box = await paneBox(page, 'mandelbrot');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const frames = Array.from({ length: 11 }, (_, i) => [
    { x: start.x - 6 * i, y: start.y + 3 * i },
  ]);
  await touchGesture(page, frames);
  const view = parseView(await urlParam(page, 'm', '-0.5,0,1.25'));
  const ps = 2.5 / Math.min(box.width, box.height);
  expectWithinPixels(view, { re: -0.5 + 60 * ps, im: 30 * ps }, ps, 0.5);
});
