/**
 * CPU reference implementations of the quadratic family f_c(z) = z² + c.
 *
 * The GPU shaders do the per-pixel work; these exist for orbit plotting, the
 * probe readout, and as the ground truth the shaders are tested against.
 * Iteration-count convention (shared with the shaders): `n` is the number of
 * applications of f_c performed when |z| first exceeded the bailout radius.
 * For the Mandelbrot set z₀ = 0, so z₁ = c.
 */

export type Complex = { re: number; im: number };

export type EscapeResult = {
  /** Iterations performed before escape, or maxIter if it never escaped. */
  n: number;
  escaped: boolean;
  /** |z|² at the point of escape (or at maxIter). */
  mag2: number;
};

export function escapeTime(
  z0: Complex,
  c: Complex,
  maxIter: number,
  bailout = 2,
): EscapeResult {
  let x = z0.re;
  let y = z0.im;
  const r2 = bailout * bailout;
  for (let n = 1; n <= maxIter; n++) {
    const xt = x * x - y * y + c.re;
    y = 2 * x * y + c.im;
    x = xt;
    const mag2 = x * x + y * y;
    if (mag2 > r2) return { n, escaped: true, mag2 };
  }
  return { n: maxIter, escaped: false, mag2: x * x + y * y };
}

export function mandelbrotEscape(c: Complex, maxIter: number, bailout = 2) {
  return escapeTime({ re: 0, im: 0 }, c, maxIter, bailout);
}

export function juliaEscape(
  z: Complex,
  c: Complex,
  maxIter: number,
  bailout = 2,
) {
  return escapeTime(z, c, maxIter, bailout);
}

/**
 * Continuous ("smooth") iteration count, matching the shader's colouring:
 * ν = n + 1 − log₂(ln|z| / ln R). Lies in [n, n+1) at escape.
 */
export function smoothIterations(res: EscapeResult, bailout: number): number {
  if (!res.escaped) return res.n;
  const logZ = 0.5 * Math.log(res.mag2);
  return res.n + 1 - Math.log2(logZ / Math.log(bailout));
}

export type Orbit = {
  /**
   * z₀, z₁, … up to and including the first point with |z| > 2, truncated to
   * the first `maxPoints` points.
   */
  points: Complex[];
  /** Iteration at which |z| > 2, or null if it stayed bounded. */
  escapedAt: number | null;
  /** Period of the attracting cycle the orbit converged to, if detected. */
  period: number | null;
};

/**
 * The orbit of z₀ under z ↦ z² + c. Escape is judged with the textbook radius
 * 2 (once |z| > 2 the orbit provably tends to ∞).
 */
export function computeOrbit(
  z0: Complex,
  c: Complex,
  maxIter: number,
  maxPoints = 2000,
): Orbit {
  const points: Complex[] = [{ ...z0 }];
  let x = z0.re;
  let y = z0.im;
  for (let n = 1; n <= maxIter; n++) {
    const xt = x * x - y * y + c.re;
    y = 2 * x * y + c.im;
    x = xt;
    if (points.length < maxPoints) points.push({ re: x, im: y });
    if (x * x + y * y > 4) return { points, escapedAt: n, period: null };
  }
  return { points, escapedAt: null, period: detectPeriod(z0, c, maxIter) };
}

/**
 * Detect convergence to an attracting cycle. Iterates past the transient, then
 * looks for the smallest p with |z_{N+p} − z_N| tiny. Returns null for orbits
 * that don't settle (neutral cycles, the boundary, chaotic orbits).
 */
export function detectPeriod(
  z0: Complex,
  c: Complex,
  maxIter: number,
  maxPeriod = 1024,
  eps = 1e-10,
): number | null {
  let x = z0.re;
  let y = z0.im;
  const transient = Math.max(maxIter, 2000);
  for (let n = 0; n < transient; n++) {
    const xt = x * x - y * y + c.re;
    y = 2 * x * y + c.im;
    x = xt;
    if (x * x + y * y > 4) return null;
  }
  const bx = x;
  const by = y;
  for (let p = 1; p <= maxPeriod; p++) {
    const xt = x * x - y * y + c.re;
    y = 2 * x * y + c.im;
    x = xt;
    const dx = x - bx;
    const dy = y - by;
    if (dx * dx + dy * dy < eps * eps) return p;
  }
  return null;
}

/** "a + bi" with sensible precision and a proper minus sign. */
export function formatComplex(z: Complex, digits = 6): string {
  const fmt = (v: number) => {
    const s =
      Math.abs(v) < 1e-4 && v !== 0
        ? v.toExponential(digits - 1)
        : v.toPrecision(digits);
    return s.includes('e')
      ? s
      : s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  };
  const re = fmt(z.re);
  const im = fmt(Math.abs(z.im));
  return `${re.replace('-', '−')} ${z.im < 0 ? '−' : '+'} ${im}i`;
}
