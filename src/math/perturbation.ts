/**
 * CPU mirror of the perturbation shader (src/render/shaders/perturb.frag),
 * using float64 deltas. It is the executable specification the shader is
 * ported from, and what the tests compare with brute-force arbitrary
 * precision. See reference-orbit.ts for the theory.
 */
import { FE_ZERO_EXP, type ReferenceOrbit } from './reference-orbit';
import type { Complex, EscapeResult } from './iterate';

function refAt(orbit: ReferenceOrbit, i: number): Complex {
  const d = orbit.data;
  const e = d[i * 4 + 2];
  if (e === FE_ZERO_EXP) return { re: 0, im: 0 };
  const s = 2 ** e;
  return { re: d[i * 4] * s, im: d[i * 4 + 1] * s };
}

/**
 * Escape time of the pixel at `delta` from the reference point (δc for the
 * Mandelbrot set, δz₀ for Julia sets).
 */
export function perturbedEscape(
  orbit: ReferenceOrbit,
  delta: Complex,
  maxIter: number,
  bailout: number,
): EscapeResult & { rebases: number } {
  const julia = orbit.kind === 'julia';
  const dcx = julia ? 0 : delta.re;
  const dcy = julia ? 0 : delta.im;
  let dx = julia ? delta.re : 0;
  let dy = julia ? delta.im : 0;
  let base = 0;
  let len = orbit.lenA;
  let m = 0;
  let Z = refAt(orbit, 0);
  const r2 = bailout * bailout;
  let rebases = 0;
  for (let n = 1; n <= maxIter; n++) {
    // δ ← δ (2Z + δ) + δc
    const ax = 2 * Z.re + dx;
    const ay = 2 * Z.im + dy;
    const nx = dx * ax - dy * ay + dcx;
    const ny = dx * ay + dy * ax + dcy;
    dx = nx;
    dy = ny;
    m++;
    Z = refAt(orbit, base + m);
    const zx = Z.re + dx;
    const zy = Z.im + dy;
    const mag2 = zx * zx + zy * zy;
    if (mag2 > r2) return { n, escaped: true, mag2, rebases };
    if (mag2 < dx * dx + dy * dy || m >= len - 1) {
      dx = zx;
      dy = zy;
      m = 0;
      base = orbit.startB;
      len = orbit.lenB;
      Z = refAt(orbit, base);
      rebases++;
    }
  }
  return { n: maxIter, escaped: false, mag2: 0, rebases };
}

/**
 * Suggest an iteration limit for a view by computing escape times of a grid
 * of sample pixels (float64 deltas, so only for half-widths above ~1e-300).
 * Returns null if no sample escaped, i.e. the view is (mostly) interior.
 */
export function suggestMaxIter(
  orbit: ReferenceOrbit,
  halfWidth: number,
  grid = 12,
): number | null {
  if (!(halfWidth > 1e-300)) return null;
  const limit = orbit.maxIter;
  const escapes: number[] = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const d = {
        re: ((2 * i + 1) / grid - 1) * halfWidth,
        im: ((2 * j + 1) / grid - 1) * halfWidth,
      };
      const res = perturbedEscape(orbit, d, limit, Math.max(orbit.bailout, 2));
      if (res.escaped) escapes.push(res.n);
    }
  }
  if (escapes.length === 0) return null;
  escapes.sort((a, b) => a - b);
  const high = escapes[Math.floor(0.98 * (escapes.length - 1))];
  const low = escapes[0];
  // Enough to resolve the slowest escaping samples, with room for the
  // structure between them.
  return Math.ceil(high + Math.max(1000, 0.5 * (high - low)));
}
