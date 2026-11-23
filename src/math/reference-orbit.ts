/**
 * Reference orbits for perturbation rendering (deep zoom).
 *
 * At deep zoom, neighbouring pixels differ by far less than float32 (or
 * float64) can resolve. Perturbation theory gets around this. One reference
 * orbit Z_n is computed at arbitrary precision, on the CPU, here. Each pixel
 * then only iterates its *difference* δ_n = z_n − Z_n, which stays small and
 * needs little precision:
 *
 *   δ_{n+1} = δ_n (2 Z_n + δ_n) + δc        (δc = 0 for Julia sets)
 *
 * The GPU does that part (src/render/shaders/perturb.frag). The CPU mirror in
 * perturbation.ts is what tests check against.
 *
 * Rebasing (Zhuoran, 2021): when |z_n| < |δ_n|, or the reference runs out,
 * the pixel switches to iterate 0 of a reference that starts at the critical
 * point 0, with δ := z_n. This removes the "glitches" of classic perturbation
 * without needing several reference points.
 * - Mandelbrot: the reference (orbit of 0 under the reference c) starts at 0,
 *   so orbit B = orbit A.
 * - Julia: orbit A starts at the view centre; orbit B is the orbit of the
 *   critical point 0 under the same c.
 *
 * Storage: each point is a normalised float-with-exponent (mantissa pair in
 * [0.5, 1) by max-abs, plus a shared binary exponent), 4 floats per point:
 * [re mantissa, im mantissa, exponent, 0]. This keeps tiny reference values
 * (the orbit passing very close to 0, as happens at deep mini-brots) from
 * underflowing.
 */
import { BigFloat, bitLength, type BigComplex } from './bigfloat';
import type { FractalKind } from './iterate';

/** Exponent stored for an exact zero (far below anything real). */
export const FE_ZERO_EXP = -100000;

/** The reference escapes at this radius at least, so it's useful for long. */
export const MIN_REFERENCE_BAILOUT = 1e4;

export type OrbitTarget = {
  kind: FractalKind;
  /** Reference point: c for the Mandelbrot set, the starting z for Julia sets. */
  ref: BigComplex;
  /** The Julia parameter (unused for the Mandelbrot set). */
  c: BigComplex;
  maxIter: number;
  bailout: number;
  /** Fractional bits of fixed-point precision. */
  bits: number;
  /**
   * If set, also sample escape times on a grid of this half-width around the
   * reference, to suggest an iteration count (see perturbation.ts).
   */
  sampleRadius?: number;
};

export type ReferenceOrbit = OrbitTarget & {
  /** 4 floats per point, orbit A then (Julia only) orbit B. */
  data: Float32Array;
  lenA: number;
  startB: number;
  lenB: number;
  /** Iteration count that resolves the sampled pixels (when sampled). */
  suggestedMaxIter?: number | null;
};

function toFixed(b: BigFloat, bits: number): bigint {
  const shift = b.e + bits;
  if (shift >= 0) return b.m << BigInt(shift);
  const s = BigInt(-shift);
  // round to nearest
  return b.m >= 0n
    ? (b.m + (1n << (s - 1n))) >> s
    : -((-b.m + (1n << (s - 1n))) >> s);
}

const TWO_POW_64 = 2 ** 64;

/** Write fixed-point (x, y) / 2^bits as a normalised float-exp to out[i..i+2]. */
function storeFE(
  x: bigint,
  y: bigint,
  bits: number,
  shift64: bigint,
  out: Float32Array,
  i: number,
) {
  // Fast path: the value is not tiny, so float64 holds it exactly enough.
  const fx = Number(x >> shift64) / TWO_POW_64;
  const fy = Number(y >> shift64) / TWO_POW_64;
  const big = Math.max(Math.abs(fx), Math.abs(fy));
  if (big >= 2 ** -40) {
    const e = Math.floor(Math.log2(big)) + 1;
    out[i] = fx * 2 ** -e;
    out[i + 1] = fy * 2 ** -e;
    out[i + 2] = e;
    return;
  }
  const ax = x < 0n ? -x : x;
  const ay = y < 0n ? -y : y;
  const top = ax > ay ? ax : ay;
  if (top === 0n) {
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = FE_ZERO_EXP;
    return;
  }
  const len = bitLength(top);
  const s = len - 53;
  const sx = s >= 0 ? Number(x >> BigInt(s)) : Number(x << BigInt(-s));
  const sy = s >= 0 ? Number(y >> BigInt(s)) : Number(y << BigInt(-s));
  out[i] = sx / 2 ** 53;
  out[i + 1] = sy / 2 ** 53;
  out[i + 2] = len - bits;
}

/**
 * Iterate z ↦ z² + c in fixed point from z0, writing each Z_n (n = 0, 1, …)
 * until |Z_n| > R or n = maxIter. Returns the number of points written.
 */
function iterateFixed(
  z0: BigComplex,
  c: BigComplex,
  bits: number,
  maxIter: number,
  bailout: number,
  out: Float32Array,
  offset: number,
  onProgress?: (n: number) => void,
): number {
  const P = BigInt(bits);
  const P1 = BigInt(bits - 1);
  const shift64 = BigInt(Math.max(0, bits - 64));
  let x = toFixed(z0.re, bits);
  let y = toFixed(z0.im, bits);
  const cx = toFixed(c.re, bits);
  const cy = toFixed(c.im, bits);
  const r = Math.max(bailout, MIN_REFERENCE_BAILOUT);
  const R2 = BigInt(Math.ceil(r * r)) << P;
  let n = 0;
  for (; ; n++) {
    storeFE(x, y, bits, shift64, out, offset + n * 4);
    if (n === maxIter) break;
    const x2 = (x * x) >> P;
    const y2 = (y * y) >> P;
    if (x2 + y2 > R2) break;
    const xy = (x * y) >> P1;
    x = x2 - y2 + cx;
    y = xy + cy;
    if (onProgress && n % 8192 === 8191) onProgress(n + 1);
  }
  return n + 1;
}

const ZERO: BigComplex = { re: BigFloat.ZERO, im: BigFloat.ZERO };

export function computeReferenceOrbit(
  target: OrbitTarget,
  onProgress?: (iterations: number) => void,
): ReferenceOrbit {
  const { kind, ref, c, maxIter, bailout, bits } = target;
  if (bits < 64) throw new RangeError('reference orbits need at least 64 bits');
  const perOrbit = (maxIter + 1) * 4;
  const scratch = new Float32Array(kind === 'julia' ? 2 * perOrbit : perOrbit);
  if (kind === 'mandelbrot') {
    const lenA = iterateFixed(
      ZERO,
      ref,
      bits,
      maxIter,
      bailout,
      scratch,
      0,
      onProgress,
    );
    return {
      ...target,
      data: scratch.slice(0, lenA * 4),
      lenA,
      startB: 0,
      lenB: lenA,
    };
  }
  const lenA = iterateFixed(
    ref,
    c,
    bits,
    maxIter,
    bailout,
    scratch,
    0,
    onProgress,
  );
  const lenB = iterateFixed(
    ZERO,
    c,
    bits,
    maxIter,
    bailout,
    scratch,
    lenA * 4,
    onProgress,
  );
  return {
    ...target,
    data: scratch.slice(0, (lenA + lenB) * 4),
    lenA,
    startB: lenA,
    lenB,
  };
}

/** Precision a reference needs for a view of radius r (with headroom to zoom further). */
export function bitsForRadius(r: BigFloat, headroom = 0): number {
  return Math.max(64, Math.ceil(-r.log2()) + 64 + headroom);
}
