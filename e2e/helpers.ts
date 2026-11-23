import { expect, type Page } from '@playwright/test';

export type Pane = 'mandelbrot' | 'julia';
type Rgb = [number, number, number];

/** Fail the test on any console error or uncaught exception. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function waitForRender(page: Page, pane: Pane) {
  await expect(page.getByTestId(`${pane}-canvas`)).toHaveAttribute(
    'data-render-state',
    'done',
  );
}

export async function paneBox(page: Page, pane: Pane) {
  const box = await page.getByTestId(pane).boundingBox();
  if (!box) throw new Error(`${pane} pane not visible`);
  return box;
}

const param = (page: Page, key: string) =>
  new URL(page.url()).searchParams.get(key) ?? '';

/**
 * Read a query parameter once the debounced URL sync has settled: it must
 * differ from `notEqual` (if given) and stay unchanged for 400ms.
 */
export async function urlParam(
  page: Page,
  key: string,
  notEqual?: string,
): Promise<string> {
  let value = '';
  await expect
    .poll(async () => {
      const first = param(page, key);
      if (first === '' || first === notEqual) return false;
      await page.waitForTimeout(400);
      value = param(page, key);
      return value === first;
    })
    .toBe(true);
  return value;
}

/** Assert two complex coordinates agree to within `tolPx` pixels of size `ps`. */
export function expectWithinPixels(
  actual: { re: number; im: number },
  expected: { re: number; im: number },
  ps: number,
  tolPx = 0.01,
) {
  expect(Math.abs(actual.re - expected.re) / ps).toBeLessThan(tolPx);
  expect(Math.abs(actual.im - expected.im) / ps).toBeLessThan(tolPx);
}

export function parseView(s: string) {
  const [re, im, r] = s.split(',').map(Number);
  return { re, im, r };
}

/** Complex coordinate of a CSS-pixel position inside a pane (same maths as src/math/viewport.ts). */
export function pixelToComplex(
  view: { re: number; im: number; r: number },
  size: { width: number; height: number },
  x: number,
  y: number,
) {
  const ps = (2 * view.r) / Math.min(size.width, size.height);
  return {
    re: view.re + (x - size.width / 2) * ps,
    im: view.im - (y - size.height / 2) * ps,
  };
}

/** Sample rendered colours (pane-relative CSS px) through the dev-only renderer hook. */
export async function samplePixels(
  page: Page,
  pane: Pane,
  points: { x: number; y: number }[],
): Promise<Rgb[]> {
  return page.getByTestId(`${pane}-canvas`).evaluate(
    (canvas, pts) =>
      (
        canvas as HTMLCanvasElement & {
          __fractal: { samplePixels(p: typeof pts): Rgb[] };
        }
      ).__fractal.samplePixels(pts),
    points,
  );
}

export function fractionMatching(a: Rgb[], b: Rgb[], tolerance = 24): number {
  let same = 0;
  a.forEach((p, i) => {
    if (Math.max(...p.map((v, k) => Math.abs(v - b[i][k]))) <= tolerance)
      same++;
  });
  return same / a.length;
}

/** A grid of sample points, avoiding the pane's corner overlays. */
export function sampleGrid(width: number, height: number, n = 12) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      pts.push({
        x: Math.round(0.25 * width + (0.5 * width * i) / n),
        y: Math.round(0.25 * height + (0.5 * height * j) / n),
      });
    }
  }
  return pts;
}

/** Make sure a pane's probe card is collapsed (it starts collapsed on narrow screens). */
export async function collapseProbe(page: Page, pane: Pane) {
  const button = page
    .getByTestId(`${pane}-probe`)
    .getByRole('button', { name: 'Collapse' });
  if (await button.isVisible()) await button.click();
}
