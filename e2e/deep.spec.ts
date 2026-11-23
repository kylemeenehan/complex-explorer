/**
 * Deep zoom: the GPU perturbation renderer against the CPU mirror
 * (src/math/perturbation.ts), which is itself tested against brute-force
 * arbitrary precision. Small viewports keep SwiftShader (CPU WebGL) fast.
 */
import { expect, test, type Page } from '@playwright/test';
import { BigFloat, bigComplex, type BigComplex } from '../src/math/bigfloat';
import { smoothIterations } from '../src/math/iterate';
import { perturbedEscape } from '../src/math/perturbation';
import {
  bitsForRadius,
  computeReferenceOrbit,
} from '../src/math/reference-orbit';
import { buildPalette, samplePalette } from '../src/render/palettes';
import {
  collapseProbe,
  fractionMatching,
  paneBox,
  sampleGrid,
  samplePixels,
  urlParam,
  waitForRender,
  watchErrors,
  type Pane,
} from './helpers';

test.use({ viewport: { width: 320, height: 260 } });

const DEFAULT_ITER = 3000;
const BAILOUT = 256;

async function expectMatchesCpu(
  page: Page,
  pane: Pane,
  opts: {
    centre: BigComplex;
    c: BigComplex;
    r: string;
    iter?: number;
    /** Fraction of samples whose colour must match. */
    colourMatch?: number;
  },
) {
  const ITER = opts.iter ?? DEFAULT_ITER;
  await waitForRender(page, pane);
  await expect(page.getByTestId(`${pane}-readout`)).toContainText(
    'perturbation',
  );
  const box = await paneBox(page, pane);
  const W = Math.round(box.width);
  const H = Math.round(box.height);
  const r = BigFloat.from(opts.r);
  const ps = (2 * r.toNumber()) / Math.min(W, H);
  const orbit = computeReferenceOrbit({
    kind: pane,
    ref: opts.centre,
    c: opts.c,
    maxIter: ITER,
    bailout: BAILOUT,
    bits: bitsForRadius(r, 32),
  });
  const palette = buildPalette('ultra');
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++)
      points.push({
        x: Math.floor(((i + 0.5) * W) / 8),
        y: Math.floor(((j + 0.5) * H) / 8),
      });
  }
  const expected = points.map(({ x, y }) => {
    const res = perturbedEscape(
      orbit,
      { re: (x + 0.5 - W / 2) * ps, im: (H / 2 - y - 0.5) * ps },
      ITER,
      BAILOUT,
    );
    if (!res.escaped) return [0, 0, 0] as [number, number, number];
    return samplePalette(palette, smoothIterations(res, BAILOUT) / 64);
  });
  const actual = await samplePixels(page, pane, points);

  expect(fractionMatching(expected, actual, 40)).toBeGreaterThan(
    opts.colourMatch ?? 0.9,
  );
  // Interior (black) vs escaping must agree almost everywhere.
  const black = (p: number[]) => p.every((v) => v === 0);
  const sameClass = expected.filter(
    (e, i) => black(e) === black(actual[i]),
  ).length;
  expect(sameClass / expected.length).toBeGreaterThan(0.95);
  // Not a trivially uniform picture.
  expect(new Set(actual.map((p) => p.join())).size).toBeGreaterThan(8);
}

test('Mandelbrot at 1e-60 around the Misiurewicz point i matches the CPU', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto(`/mandelbrot?m=0,1,1e-60&it=${DEFAULT_ITER}&orbit=0`);
  await expectMatchesCpu(page, 'mandelbrot', {
    centre: bigComplex(0, 1),
    c: bigComplex(0, 0),
    r: '1e-60',
  });
  expect(errors).toEqual([]);
});

test('Mandelbrot at 1e-20 in Seahorse Valley matches the CPU', async ({
  page,
}) => {
  const centre = bigComplex(
    '-0.743643887037158704752191506114774',
    '0.131825904205311970493132056385139',
  );
  // Pixels here escape after ~9,000–16,000 iterations, through chaotic
  // filaments: float32 (GPU) and float64 (CPU) deltas drift apart by tens of
  // iterations on some pixels (checked by emulating float32 on the CPU), so
  // only most colours can be expected to match.
  const iter = 20000;
  await page.goto(
    `/mandelbrot?m=${centre.re.toString(40)},${centre.im.toString(40)},1e-20&it=${iter}&orbit=0`,
  );
  await expectMatchesCpu(page, 'mandelbrot', {
    centre,
    c: bigComplex(0, 0),
    r: '1e-20',
    iter,
    colourMatch: 0.7,
  });
});

test('Julia set for c = i at 1e-40 around z = i matches the CPU', async ({
  page,
}) => {
  await page.goto(`/julia?j=0,1,1e-40&c=0,1&it=${DEFAULT_ITER}&orbit=0`);
  await expectMatchesCpu(page, 'julia', {
    centre: bigComplex(0, 1),
    c: bigComplex(0, 1),
    r: '1e-40',
  });
});

test('zooming through the perturbation threshold keeps the cursor point fixed', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/mandelbrot?m=-0.7453,0.1127,0.0004&orbit=0&it=500');
  await waitForRender(page, 'mandelbrot');
  await collapseProbe(page, 'mandelbrot');
  const box = await paneBox(page, 'mandelbrot');
  const cursor = {
    x: Math.round(box.x + box.width * 0.6),
    y: Math.round(box.y + box.height * 0.6),
  };
  await page.mouse.move(cursor.x, cursor.y);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);
  await expect(page.getByTestId('mandelbrot-readout')).toContainText(
    'perturbation',
  );
  await waitForRender(page, 'mandelbrot');
  expect(errors).toEqual([]);
});

test('panning at 1e-60 moves the picture with the pointer', async ({
  page,
}) => {
  await page.goto(`/mandelbrot?m=0,1,1e-60&it=${DEFAULT_ITER}&orbit=0`);
  await waitForRender(page, 'mandelbrot');
  await collapseProbe(page, 'mandelbrot');
  const box = await paneBox(page, 'mandelbrot');
  const grid = sampleGrid(box.width, box.height, 8);
  const before = await samplePixels(page, 'mandelbrot', grid);
  const start = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 25, { steps: 5 });
  await page.mouse.up();
  await urlParam(page, 'm', '0,1,1e-60');
  await waitForRender(page, 'mandelbrot');
  const after = await samplePixels(
    page,
    'mandelbrot',
    grid.map((p) => ({ x: p.x + 40, y: p.y + 25 })),
  );
  expect(fractionMatching(before, after, 8)).toBeGreaterThan(0.9);
});
