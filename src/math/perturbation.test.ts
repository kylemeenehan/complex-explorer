import { describe, expect, it } from 'vitest';
import { BigFloat, bigComplex, type BigComplex } from './bigfloat';
import { escapeTime } from './iterate';
import { perturbedEscape, suggestMaxIter } from './perturbation';
import {
  bitsForRadius,
  computeReferenceOrbit,
  FE_ZERO_EXP,
} from './reference-orbit';

/** Ground truth: iterate in arbitrary precision. */
function bruteForce(
  z0: BigComplex,
  c: BigComplex,
  maxIter: number,
  bits: number,
  bailout = 2,
) {
  let x = z0.re;
  let y = z0.im;
  const r2 = bailout * bailout;
  for (let n = 1; n <= maxIter; n++) {
    const x2 = x.mul(x).roundAbs(bits);
    const y2 = y.mul(y).roundAbs(bits);
    const xy = x.mul(y).mulPow2(1).roundAbs(bits);
    x = x2.sub(y2).add(c.re);
    y = xy.add(c.im);
    const xf = x.toNumber();
    const yf = y.toNumber();
    if (xf * xf + yf * yf > r2) return { n, escaped: true };
  }
  return { n: maxIter, escaped: false };
}

const ZERO = bigComplex(0, 0);

describe('reference orbits', () => {
  it('stores the orbit of 0 for c = -1 (a 2-cycle 0, -1, 0, -1, …)', () => {
    const orbit = computeReferenceOrbit({
      kind: 'mandelbrot',
      ref: bigComplex(-1, 0),
      c: ZERO,
      maxIter: 5,
      bailout: 2,
      bits: 64,
    });
    expect(orbit.lenA).toBe(6);
    expect(orbit.startB).toBe(0);
    const values = Array.from({ length: 6 }, (_, i) =>
      orbit.data[i * 4 + 2] === FE_ZERO_EXP
        ? 0
        : orbit.data[i * 4] * 2 ** orbit.data[i * 4 + 2],
    );
    expect(values).toEqual([0, -1, 0, -1, 0, -1]);
  });

  it('stops after the reference escapes', () => {
    const orbit = computeReferenceOrbit({
      kind: 'mandelbrot',
      ref: bigComplex(1, 0),
      c: ZERO,
      maxIter: 100,
      bailout: 2,
      bits: 64,
    });
    // 0, 1, 2, 5, 26, 677, 458330 (> 1e4, stop)
    expect(orbit.lenA).toBe(7);
  });

  it('keeps tiny values instead of underflowing', () => {
    const tiny = BigFloat.from('1e-200');
    const orbit = computeReferenceOrbit({
      kind: 'julia',
      ref: { re: tiny, im: tiny.neg() },
      c: ZERO,
      maxIter: 1,
      bailout: 2,
      bits: 800,
    });
    const [m, , e] = orbit.data;
    expect(m * 2 ** (e + 600)).toBeCloseTo(1e-200 * 2 ** 600, 5);
    expect(orbit.startB).toBe(orbit.lenA);
  });
});

describe('perturbation matches brute-force arbitrary precision', () => {
  const cases = [
    {
      name: 'Mandelbrot, Seahorse Valley at r = 1e-20 (beyond float64)',
      kind: 'mandelbrot' as const,
      centre: bigComplex(
        '-0.743643887037158704752191506114774',
        '0.131825904205311970493132056385139',
      ),
      c: ZERO,
      r: '1e-20',
      maxIter: 3000,
      expectRebases: true,
    },
    {
      name: 'Mandelbrot, near a mini-brot on the antenna at r = 1e-12',
      kind: 'mandelbrot' as const,
      centre: bigComplex(
        '-1.7548776662466927600495',
        '0.0000000000000000000001',
      ),
      c: ZERO,
      r: '1e-12',
      maxIter: 3000,
      expectRebases: true,
    },
    {
      name: 'Julia, rabbit at r = 1e-18',
      kind: 'julia' as const,
      centre: bigComplex(
        '0.3966666666666666666666666',
        '0.1033333333333333333333',
      ),
      c: bigComplex('-0.12256116687665361', '0.74486176661974424'),
      r: '1e-18',
      maxIter: 2000,
      expectRebases: false,
    },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      const r = BigFloat.from(tc.r);
      const bits = bitsForRadius(r, 32);
      const orbit = computeReferenceOrbit({
        kind: tc.kind,
        ref: tc.centre,
        c: tc.c,
        maxIter: tc.maxIter,
        bailout: 2,
        bits,
      });
      let agree = 0;
      let total = 0;
      let rebases = 0;
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          const d = { re: (i / 3) * r.toNumber(), im: (j / 3) * r.toNumber() };
          const p = perturbedEscape(orbit, d, tc.maxIter, 2);
          rebases += p.rebases;
          const point = {
            re: tc.centre.re.add(BigFloat.fromNumber(d.re)),
            im: tc.centre.im.add(BigFloat.fromNumber(d.im)),
          };
          const truth =
            tc.kind === 'mandelbrot'
              ? bruteForce(ZERO, point, tc.maxIter, bits)
              : bruteForce(point, tc.c, tc.maxIter, bits);
          total++;
          if (truth.escaped === p.escaped && Math.abs(truth.n - p.n) <= 1)
            agree++;
        }
      }
      expect(agree / total).toBeGreaterThanOrEqual(0.95);
      // Where the reference escapes early, the rebasing path must be exercised.
      if (tc.expectRebases) expect(rebases).toBeGreaterThan(0);
    });
  }

  it('agrees with plain float64 iteration at shallow zoom', () => {
    const centre = bigComplex('-0.75', '0.1');
    const orbit = computeReferenceOrbit({
      kind: 'mandelbrot',
      ref: centre,
      c: ZERO,
      maxIter: 500,
      bailout: 2,
      bits: 64,
    });
    // The reference is stored in float32, so chaotic points near the boundary
    // may differ by an iteration or two; the picture must still agree.
    let agree = 0;
    for (let i = 0; i < 200; i++) {
      const d = { re: Math.sin(i) * 0.01, im: Math.cos(i * 1.3) * 0.01 };
      const p = perturbedEscape(orbit, d, 500, 2);
      const direct = escapeTime(
        { re: 0, im: 0 },
        { re: -0.75 + d.re, im: 0.1 + d.im },
        500,
        2,
      );
      if (p.escaped === direct.escaped && Math.abs(p.n - direct.n) <= 1)
        agree++;
    }
    expect(agree / 200).toBeGreaterThan(0.95);
  });
});

describe('suggestMaxIter', () => {
  it('asks for enough iterations deep in Seahorse Valley', () => {
    const ref = bigComplex(
      '-0.743643887037158704752191506114774',
      '0.131825904205311970493132056385139',
    );
    const orbit = computeReferenceOrbit({
      kind: 'mandelbrot',
      ref,
      c: ZERO,
      maxIter: 40000,
      bailout: 2,
      bits: 200,
    });
    const n = suggestMaxIter(orbit, 1e-25)!;
    // Pixels here escape after ~16,000 iterations.
    expect(n).toBeGreaterThan(16100);
    expect(n).toBeLessThan(40000);
  });

  it('returns null when nothing escapes', () => {
    const orbit = computeReferenceOrbit({
      kind: 'mandelbrot',
      ref: bigComplex(0, 0),
      c: ZERO,
      maxIter: 2000,
      bailout: 2,
      bits: 64,
    });
    expect(suggestMaxIter(orbit, 0.1)).toBeNull();
  });
});
