import { describe, expect, it } from 'vitest';
import { BigFloat } from './bigfloat';
import {
  complexToPixel,
  makeView,
  MAX_RADIUS,
  panByPixels,
  pixelSize,
  pixelToComplex,
  zoomAt,
  zoomBy,
  type View,
} from './viewport';

const size = { width: 1600, height: 900 };

function expectClose(a: BigFloat, b: BigFloat, tol: BigFloat) {
  expect(a.sub(b).abs().cmp(tol)).toBeLessThanOrEqual(0);
}

describe.each([
  ['shallow', makeView(-0.5, 0, 1.25)],
  [
    'deep',
    makeView(
      '-0.743643887037158704752191506114774',
      '0.131825904205311970493132056385139',
      '1e-200',
    ),
  ],
  ['beyond float64', makeView('-1.7499', '0.0000000001', '3e-500')],
])('viewport (%s)', (_, view: View) => {
  const ps = pixelSize(view, size);
  const tol = ps.mulNumber(1e-6);

  it('uses the shorter side for the radius', () => {
    expect(ps.toFloatExp().mant).toBeCloseTo(
      view.r.mulNumber(2 / 900).toFloatExp().mant,
      12,
    );
  });

  it('maps the canvas centre to the view centre and is y-up', () => {
    const c = pixelToComplex(view, size, 800, 450);
    expectClose(c.re, view.re, tol);
    expectClose(c.im, view.im, tol);
    const above = pixelToComplex(view, size, 800, 0);
    expect(above.im.cmp(view.im)).toBe(1);
    const right = pixelToComplex(view, size, 1600, 450);
    expect(right.re.cmp(view.re)).toBe(1);
  });

  it('pixelToComplex and complexToPixel are inverse', () => {
    const z = pixelToComplex(view, size, 123.25, 678.5);
    const p = complexToPixel(view, size, z);
    expect(p.x).toBeCloseTo(123.25, 4);
    expect(p.y).toBeCloseTo(678.5, 4);
  });

  it('panning moves content with the pointer', () => {
    const grabbed = pixelToComplex(view, size, 300, 200);
    const moved = panByPixels(view, size, 57, -31);
    const p = complexToPixel(moved, size, grabbed);
    expect(p.x).toBeCloseTo(357, 4);
    expect(p.y).toBeCloseTo(169, 4);
  });

  it('pan followed by the inverse pan is the identity', () => {
    const back = panByPixels(
      panByPixels(view, size, 40.5, -12),
      size,
      -40.5,
      12,
    );
    expectClose(back.re, view.re, tol);
    expectClose(back.im, view.im, tol);
  });

  it('zoomAt keeps the point under the cursor fixed', () => {
    for (const factor of [0.5, 0.9, 1.1, 2]) {
      const before = pixelToComplex(view, size, 1200, 100);
      const zoomed = zoomAt(view, size, 1200, 100, factor);
      const after = pixelToComplex(zoomed, size, 1200, 100);
      const ptol = pixelSize(zoomed, size).mulNumber(1e-6);
      expectClose(after.re, before.re, ptol);
      expectClose(after.im, before.im, ptol);
      expect(zoomed.r.toFloatExp().mant).toBeCloseTo(
        view.r.mulNumber(factor).toFloatExp().mant,
        12,
      );
    }
  });
});

describe('zoom limits', () => {
  it('clamps zooming out', () => {
    const v = zoomBy(makeView(0, 0, 10), 100);
    expect(v.r.toNumber()).toBe(MAX_RADIUS);
    const w = zoomAt(makeView(0, 0, 10), size, 0, 0, 100);
    expect(w.r.toNumber()).toBe(MAX_RADIUS);
  });
});
