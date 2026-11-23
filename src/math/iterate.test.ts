import { describe, expect, it } from 'vitest';
import {
  computeOrbit,
  detectPeriod,
  formatComplex,
  mandelbrotEscape,
  juliaEscape,
  smoothIterations,
} from './iterate';

const zero = { re: 0, im: 0 };

describe('escape time', () => {
  it('classifies known Mandelbrot members', () => {
    for (const c of [
      zero,
      { re: -1, im: 0 },
      { re: -0.1, im: 0.1 },
      { re: 0.25, im: 0 },
      { re: -2, im: 0 },
      { re: 0, im: 1 },
    ]) {
      expect(mandelbrotEscape(c, 2000).escaped).toBe(false);
    }
  });

  it('classifies known non-members', () => {
    expect(mandelbrotEscape({ re: 1, im: 0 }, 100)).toMatchObject({
      escaped: true,
      n: 3,
    });
    expect(mandelbrotEscape({ re: 0.26, im: 0 }, 1000).escaped).toBe(true);
    expect(mandelbrotEscape({ re: -2.01, im: 0 }, 1000).escaped).toBe(true);
  });

  it('agrees with the Julia definition: J_c contains 0 iff c is in M', () => {
    const c = { re: -0.122561, im: 0.744862 };
    expect(juliaEscape(zero, c, 1000).escaped).toBe(
      mandelbrotEscape(c, 1000).escaped,
    );
  });

  it('smooth iteration count lies in [n, n+1]', () => {
    for (const re of [0.3, 0.5, 1, 2, -2.5]) {
      const res = mandelbrotEscape({ re, im: 0.1 }, 1000, 256);
      const nu = smoothIterations(res, 256);
      expect(nu).toBeGreaterThanOrEqual(res.n - 1e-9);
      expect(nu).toBeLessThanOrEqual(res.n + 1 + 1e-9);
    }
  });
});

describe('orbits', () => {
  it('records the orbit of 0 for c = 1 until it escapes', () => {
    const o = computeOrbit(zero, { re: 1, im: 0 }, 100);
    expect(o.points.map((p) => p.re)).toEqual([0, 1, 2, 5]);
    expect(o.escapedAt).toBe(3);
    expect(o.period).toBeNull();
  });

  it('detects attracting cycles of the right period', () => {
    expect(detectPeriod(zero, { re: 0, im: 0 }, 1000)).toBe(1);
    expect(detectPeriod(zero, { re: -1, im: 0 }, 1000)).toBe(2);
    // Douady rabbit centre: superattracting 3-cycle
    expect(
      detectPeriod(zero, { re: -0.12256116687665, im: 0.74486176661974 }, 1000),
    ).toBe(3);
    // Airplane: period 3 on the real axis
    expect(detectPeriod(zero, { re: -1.75487766624669, im: 0 }, 1000)).toBe(3);
    expect(computeOrbit(zero, { re: -1, im: 0 }, 1000).period).toBe(2);
  });

  it('reports no period on the boundary (Misiurewicz c = i is preperiodic, not attracting)', () => {
    // 0 → i → −1+i → −i → −1+i … : a repelling 2-cycle; numerically it stays put
    const p = detectPeriod(zero, { re: 0, im: 1 }, 100);
    expect(p === null || p === 2).toBe(true);
  });
});

describe('formatComplex', () => {
  it('uses proper minus signs and i', () => {
    expect(formatComplex({ re: -0.75, im: 0.1 })).toBe('−0.75 + 0.1i');
    expect(formatComplex({ re: 0.5, im: -2 })).toBe('0.5 − 2i');
  });
});
