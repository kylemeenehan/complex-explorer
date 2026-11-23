/**
 * Arbitrary-precision binary floating point: value = m * 2^e, with m a BigInt.
 *
 * Used for anything that must survive deep zoom: the view centre, the view
 * radius, and the Julia parameter c. A JS `number` (float64) runs out of
 * precision for positions once the view is narrower than ~1e-15 and runs out
 * of exponent range below ~1e-308, so view state never lives in a `number`.
 *
 * Values are immutable. Arithmetic is exact (add/sub/mul never round); call
 * `roundAbs`/`roundRel` to bound the size of the mantissa.
 */

const LOG10_2 = Math.log10(2);
const LOG2_10 = Math.log2(10);

export function bitLength(n: bigint): number {
  if (n < 0n) n = -n;
  if (n === 0n) return 0;
  const hex = n.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16)));
}

/** Round m / 2^shift to the nearest integer (ties away from zero). */
function roundShift(m: bigint, shift: number): bigint {
  if (shift <= 0) return m << BigInt(-shift);
  const s = BigInt(shift);
  const half = 1n << (s - 1n);
  return m >= 0n ? (m + half) >> s : -((-m + half) >> s);
}

/** Exact x * 2^k for a float64 x, avoiding intermediate under/overflow. */
function ldexp(x: number, k: number): number {
  while (k > 1000) {
    x *= 2 ** 1000;
    k -= 1000;
  }
  while (k < -1000) {
    x *= 2 ** -1000;
    k += 1000;
  }
  return x * 2 ** k;
}

const pow10Cache = new Map<number, bigint>();
function pow10(n: number): bigint {
  let v = pow10Cache.get(n);
  if (v === undefined) {
    v = 10n ** BigInt(n);
    if (n < 4096) pow10Cache.set(n, v);
  }
  return v;
}

const NUMBER_RE = /^\s*([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/;

export class BigFloat {
  readonly m: bigint;
  readonly e: number;

  constructor(m: bigint, e: number) {
    this.m = m;
    this.e = m === 0n ? 0 : e;
  }

  static readonly ZERO = new BigFloat(0n, 0);
  static readonly ONE = new BigFloat(1n, 0);

  /** Exact conversion from a finite float64. */
  static fromNumber(x: number): BigFloat {
    if (!Number.isFinite(x)) throw new RangeError(`not finite: ${x}`);
    if (x === 0) return BigFloat.ZERO;
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    const hi = view.getUint32(0);
    const lo = view.getUint32(4);
    const sign = hi >>> 31 ? -1n : 1n;
    const biased = (hi >>> 20) & 0x7ff;
    const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let m: bigint;
    let e: number;
    if (biased === 0) {
      m = frac;
      e = -1074;
    } else {
      m = frac | (1n << 52n);
      e = biased - 1075;
    }
    return new BigFloat(sign * m, e).normalize();
  }

  /**
   * Parse a decimal string such as "-0.75", "1e-40" or "-1.2345678901234567890123e-3".
   * The result carries at least `minBits` bits of relative precision (default
   * 256, about 77 digits, so short decimals like "-0.8" stay exact well into
   * deep zoom), and more if the string has more significant digits than that. Returns null if the
   * string is not a number.
   */
  static parse(s: string, minBits = 256): BigFloat | null {
    const match = NUMBER_RE.exec(s);
    if (!match) return null;
    const [, sign, intPart = '', fracPart = '', expPart] = match;
    if (intPart.length + fracPart.length === 0) return null;
    const digits = (intPart + fracPart).replace(/^0+/, '');
    if (digits.length === 0) return BigFloat.ZERO;
    const exp10 = (expPart ? parseInt(expPart, 10) : 0) - fracPart.length;
    if (!Number.isFinite(exp10) || Math.abs(exp10) > 100000) return null;
    const n = BigInt(digits) * (sign === '-' ? -1n : 1n);
    if (exp10 >= 0) return new BigFloat(n * pow10(exp10), 0).normalize();
    const den = pow10(-exp10);
    const targetBits = Math.max(
      minBits,
      Math.ceil(digits.length * LOG2_10) + 16,
    );
    const shift = bitLength(den) - bitLength(n) + targetBits;
    const num = n << BigInt(shift);
    const q = num >= 0n ? (num + den / 2n) / den : -((-num + den / 2n) / den);
    return new BigFloat(q, -shift).normalize();
  }

  /** Parse, or throw. Convenience for constants and tests. */
  static from(x: number | string | BigFloat): BigFloat {
    if (x instanceof BigFloat) return x;
    if (typeof x === 'number') return BigFloat.fromNumber(x);
    const v = BigFloat.parse(x);
    if (v === null) throw new SyntaxError(`not a number: ${x}`);
    return v;
  }

  /** Strip trailing zero bits from the mantissa. */
  normalize(): BigFloat {
    if (this.m === 0n) return BigFloat.ZERO;
    let m = this.m;
    let e = this.e;
    // Fast path: strip 32 bits at a time.
    while ((m & 0xffffffffn) === 0n) {
      m >>= 32n;
      e += 32;
    }
    while ((m & 1n) === 0n) {
      m >>= 1n;
      e += 1;
    }
    return m === this.m ? this : new BigFloat(m, e);
  }

  isZero(): boolean {
    return this.m === 0n;
  }

  sign(): number {
    return this.m > 0n ? 1 : this.m < 0n ? -1 : 0;
  }

  neg(): BigFloat {
    return new BigFloat(-this.m, this.e);
  }

  abs(): BigFloat {
    return this.m < 0n ? this.neg() : this;
  }

  add(b: BigFloat): BigFloat {
    if (b.m === 0n) return this;
    if (this.m === 0n) return b;
    const e = Math.min(this.e, b.e);
    const m = (this.m << BigInt(this.e - e)) + (b.m << BigInt(b.e - e));
    return new BigFloat(m, e);
  }

  sub(b: BigFloat): BigFloat {
    return this.add(b.neg());
  }

  mul(b: BigFloat): BigFloat {
    return new BigFloat(this.m * b.m, this.e + b.e);
  }

  mulNumber(x: number): BigFloat {
    return this.mul(BigFloat.fromNumber(x));
  }

  /** this * 2^k, exact. */
  mulPow2(k: number): BigFloat {
    return new BigFloat(this.m, this.e + k);
  }

  cmp(b: BigFloat): number {
    return this.sub(b).sign();
  }

  equals(b: BigFloat): boolean {
    return this.cmp(b) === 0;
  }

  /** Round to an absolute precision of 2^-bits (i.e. to a multiple of 2^-bits). */
  roundAbs(bits: number): BigFloat {
    const targetE = -bits;
    if (this.e >= targetE) return this;
    return new BigFloat(roundShift(this.m, targetE - this.e), targetE);
  }

  /** Round to `bits` significant bits. */
  roundRel(bits: number): BigFloat {
    const len = bitLength(this.m);
    if (len <= bits) return this;
    const shift = len - bits;
    return new BigFloat(roundShift(this.m, shift), this.e + shift);
  }

  /** log2(|this|) as a float; -Infinity for zero. Works far outside float64 range. */
  log2(): number {
    if (this.m === 0n) return -Infinity;
    const { mant, exp } = this.toFloatExp();
    return Math.log2(Math.abs(mant)) + exp;
  }

  log10(): number {
    return this.log2() * LOG10_2;
  }

  /**
   * Split into a float64 mantissa in [0.5, 1) (signed) and an integer binary
   * exponent: value ≈ mant * 2^exp. Never under- or overflows.
   */
  toFloatExp(): { mant: number; exp: number } {
    if (this.m === 0n) return { mant: 0, exp: 0 };
    const len = bitLength(this.m);
    const shift = len - 53;
    const top =
      shift > 0 ? roundShift(this.m, shift) : this.m << BigInt(-shift);
    // top has 53 (or 54 after rounding up) bits
    return { mant: Number(top) / 2 ** 53, exp: this.e + shift + 53 };
  }

  /** Nearest float64 (0 on underflow, ±Infinity on overflow). */
  toNumber(): number {
    const { mant, exp } = this.toFloatExp();
    return ldexp(mant, exp);
  }

  /**
   * Decimal representation with up to `sig` significant digits (trailing
   * zeros trimmed, and never more digits than the value's precision holds). Uses plain notation for moderate exponents and scientific
   * notation otherwise, e.g. "-0.75", "1.5e-40".
   */
  toString(sig = 17): string {
    if (this.m === 0n) return '0';
    sig = Math.max(1, Math.floor(sig));
    // A long mantissa came from rounding (e.g. parsing "0.8"); digits beyond
    // its precision would just print the rounding error.
    const len = bitLength(this.m);
    if (len >= 60) sig = Math.min(sig, Math.floor(len * LOG10_2) - 1);
    const neg = this.m < 0n;
    const a = neg ? -this.m : this.m;
    let k = Math.floor(this.log10());
    let q = scaleToInt(a, this.e, sig - 1 - k);
    if (q >= pow10(sig)) {
      k += 1;
      q = scaleToInt(a, this.e, sig - 1 - k);
    } else if (q < pow10(sig - 1)) {
      k -= 1;
      q = scaleToInt(a, this.e, sig - 1 - k);
    }
    // Rounding may still carry into an extra digit (e.g. 9.99 -> 10.0).
    if (q >= pow10(sig)) {
      q /= 10n;
      k += 1;
    }
    let digits = q.toString().replace(/0+$/, '');
    if (digits === '') digits = '0';
    let out: string;
    if (k >= -7 && k < 21) {
      if (k >= 0) {
        const intLen = k + 1;
        out =
          digits.length <= intLen
            ? digits + '0'.repeat(intLen - digits.length)
            : `${digits.slice(0, intLen)}.${digits.slice(intLen)}`;
      } else {
        out = `0.${'0'.repeat(-k - 1)}${digits}`;
      }
    } else {
      out =
        digits.length === 1
          ? `${digits}e${k}`
          : `${digits[0]}.${digits.slice(1)}e${k}`;
    }
    return neg ? `-${out}` : out;
  }
}

/** round(a * 2^e * 10^t) for a >= 0. */
function scaleToInt(a: bigint, e: number, t: number): bigint {
  let num = a;
  let den = 1n;
  if (t >= 0) num *= pow10(t);
  else den = pow10(-t);
  if (e >= 0) num <<= BigInt(e);
  else den <<= BigInt(-e);
  return (num + den / 2n) / den;
}

export type BigComplex = { re: BigFloat; im: BigFloat };

export function bigComplex(
  re: number | string,
  im: number | string,
): BigComplex {
  return { re: BigFloat.from(re), im: BigFloat.from(im) };
}
