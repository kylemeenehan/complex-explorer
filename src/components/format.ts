import type { Orbit } from '../math/iterate';
import type { BigComplex } from '../math/bigfloat';

/** "a + bi" for arbitrary-precision values, with proper minus signs. */
export function formatBigComplex(z: BigComplex, digits = 10): string {
  const re = z.re.toString(digits).replace('-', '−');
  const im = z.im.abs().toString(digits);
  return `${re} ${z.im.sign() < 0 ? '−' : '+'} ${im}i`;
}

/** What an orbit tells us, in words. */
export function describeOrbit(
  orbit: Orbit,
  maxIter: number,
  subject: string,
): string {
  if (orbit.escapedAt !== null) {
    return `The orbit of ${subject} leaves the disc |z| ≤ 2 at iteration ${orbit.escapedAt}, so it tends to ∞.`;
  }
  if (orbit.period !== null) {
    return orbit.period === 1
      ? `The orbit of ${subject} converges to an attracting fixed point.`
      : `The orbit of ${subject} converges to an attracting cycle of period ${orbit.period}.`;
  }
  return `The orbit of ${subject} stays in |z| ≤ 2 for ${maxIter.toLocaleString()} iterations without settling on an attracting cycle.`;
}
