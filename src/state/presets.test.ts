import { describe, expect, it } from 'vitest';
import { mandelbrotEscape } from '../math/iterate';
import { DEFAULT_STATE } from './app-state';
import { PRESETS } from './presets';

const inM = (id: string) => {
  const s = PRESETS.find((p) => p.id === id)!.apply(DEFAULT_STATE);
  return !mandelbrotEscape(
    { re: s.c.re.toNumber(), im: s.c.im.toNumber() },
    20000,
  ).escaped;
};

describe('presets', () => {
  it('have unique ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it('describe c correctly relative to the Mandelbrot set', () => {
    for (const id of [
      'rabbit',
      'basilica',
      'san-marco',
      'cauliflower',
      'dendrite',
      'siegel',
      'airplane',
      'misiurewicz-i',
    ]) {
      expect(inM(id), id).toBe(true);
    }
    expect(inM('cantor-dust')).toBe(false);
    expect(inM('spiral')).toBe(false);
  });
});
