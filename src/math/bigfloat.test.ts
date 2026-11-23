import { describe, expect, it } from 'vitest';
import { BigFloat, bitLength } from './bigfloat';

describe('bitLength', () => {
  it('counts bits', () => {
    expect(bitLength(0n)).toBe(0);
    expect(bitLength(1n)).toBe(1);
    expect(bitLength(255n)).toBe(8);
    expect(bitLength(256n)).toBe(9);
    expect(bitLength(-256n)).toBe(9);
    expect(bitLength(1n << 1000n)).toBe(1001);
  });
});

describe('BigFloat', () => {
  it('round-trips float64 values exactly', () => {
    for (const x of [
      0,
      1,
      -1,
      0.1,
      -0.75,
      1e-300,
      5e-324,
      1.7976931348623157e308,
      Math.PI,
    ]) {
      expect(BigFloat.fromNumber(x).toNumber()).toBe(x);
    }
  });

  it('parses decimals', () => {
    expect(BigFloat.parse('-0.75')!.toNumber()).toBe(-0.75);
    expect(BigFloat.parse('1e-40')!.toNumber()).toBe(1e-40);
    expect(BigFloat.parse('  +12.5e2 ')!.toNumber()).toBe(1250);
    expect(BigFloat.parse('.5')!.toNumber()).toBe(0.5);
    expect(BigFloat.parse('0')!.isZero()).toBe(true);
    expect(BigFloat.parse('1e-400')!.log10()).toBeCloseTo(-400, 9);
  });

  it('rejects junk', () => {
    for (const s of ['', '.', 'abc', '1e', '1..2', '--1', 'NaN', 'Infinity']) {
      expect(BigFloat.parse(s)).toBeNull();
    }
  });

  it('formats decimals', () => {
    expect(BigFloat.from(-0.75).toString()).toBe('-0.75');
    expect(BigFloat.from('1.5e-40').toString(6)).toBe('1.5e-40');
    expect(BigFloat.from(1250).toString()).toBe('1250');
    expect(BigFloat.from(0.1).toString(17)).toBe('0.10000000000000001');
    expect(BigFloat.from(0.1).toString(5)).toBe('0.1');
    expect(BigFloat.from('9.996').toString(3)).toBe('10');
    expect(BigFloat.from('123456').toString(2)).toBe('120000');
    expect(BigFloat.from('1e25').toString()).toBe('1e25');
  });

  it('keeps every digit of long decimals', () => {
    const s = '-1.7400623825793399052208441670658488567129696577282e-3';
    const plain = '-0.0017400623825793399052208441670658488567129696577282';
    expect(BigFloat.from(s).toString(50)).toBe(plain);
    const deep =
      '-0.74364388703715870475219150611477519531249999999999999999999999993';
    expect(BigFloat.from(deep).toString(65)).toBe(deep);
  });

  it('does exact arithmetic beyond float64', () => {
    const a = BigFloat.from('1');
    const tiny = BigFloat.from('1e-100');
    const sum = a.add(tiny);
    expect(sum.sub(a).toString()).toBe('1e-100');
    expect(sum.toNumber()).toBe(1);
    expect(BigFloat.from(3).mul(BigFloat.from(-0.5)).toNumber()).toBe(-1.5);
    expect(BigFloat.from(3).mulPow2(-3).toNumber()).toBe(0.375);
    expect(BigFloat.from(2).cmp(BigFloat.from(3))).toBe(-1);
  });

  it('rounds', () => {
    const x = BigFloat.from('0.123456789');
    expect(x.roundAbs(10).toNumber()).toBe(
      Math.round(0.123456789 * 1024) / 1024,
    );
    expect(BigFloat.from(1023).roundRel(3).toNumber()).toBe(1024);
    expect(BigFloat.from(-1.5).roundAbs(0).toNumber()).toBe(-2);
  });

  it('handles exponents outside float64 range', () => {
    const r = BigFloat.from('3e-500');
    expect(r.toNumber()).toBe(0);
    expect(r.log10()).toBeCloseTo(-500 + Math.log10(3), 9);
    const { mant, exp } = r.toFloatExp();
    expect(Math.abs(mant)).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(mant)).toBeLessThanOrEqual(1);
    expect(Math.log10(mant) + exp * Math.log10(2)).toBeCloseTo(r.log10(), 9);
  });
});
