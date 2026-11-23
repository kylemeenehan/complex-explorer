import { describe, expect, it } from 'vitest';
import { makeView, viewsEqual } from '../math/viewport';
import {
  DEFAULT_STATE,
  effectiveMaxIter,
  parseState,
  serializeState,
  type AppState,
} from './app-state';
import { BigFloat } from '../math/bigfloat';

describe('URL state', () => {
  it('falls back to defaults for an empty or junk query', () => {
    expect(parseState('')).toEqual(DEFAULT_STATE);
    const junk = parseState(
      '?m=1,2&j=a,b,c&c=x&it=-5&R=0&pal=nope&pd=0&sm=maybe',
    );
    expect(junk).toEqual(DEFAULT_STATE);
  });

  it('round-trips a deep, fully customised state', () => {
    const state: AppState = {
      m: makeView(
        '-0.743643887037158704752191506114774',
        '0.131825904205311970493132056385139',
        '1.5e-30',
      ),
      j: makeView(0.1, -0.2, 0.5),
      c: {
        re: BigFloat.from('-0.743643887037158704752191506114774'),
        im: BigFloat.from('0.131825904205311970493132056385139'),
      },
      settings: {
        maxIter: 5000,
        bailout: 2,
        palette: 'fire',
        density: 2.5,
        offset: 0.25,
        smooth: false,
        grid: true,
        orbit: false,
        follow: true,
      },
    };
    const query = serializeState(state, 'explore');
    const back = parseState(`?${query}`);
    expect(
      viewsEqual(back.m, state.m) ||
        back.m.re.sub(state.m.re).abs().log10() < -40,
    ).toBe(true);
    expect(back.m.re.toString(36)).toBe(state.m.re.toString(36));
    expect(back.m.im.toString(36)).toBe(state.m.im.toString(36));
    expect(back.m.r.toString(6)).toBe('1.5e-30');
    expect(back.c.re.toString(36)).toBe(state.c.re.toString(36));
    expect(back.settings).toEqual(state.settings);
    expect(query).toContain('m=-0.7436438870');
    expect(query).not.toContain('%2C');
  });

  it('only includes keys the page uses', () => {
    const q = serializeState(DEFAULT_STATE, 'mandelbrot');
    expect(q).toContain('m=');
    expect(q).toContain('c=');
    expect(q).not.toContain('j=');
    expect(q).not.toContain('pal=');
  });

  it('scales auto iterations with depth', () => {
    const shallow = effectiveMaxIter(DEFAULT_STATE.settings, makeView(0, 0, 1));
    const deep = effectiveMaxIter(
      DEFAULT_STATE.settings,
      makeView(0, 0, '1e-50'),
    );
    expect(shallow).toBe(500);
    expect(deep).toBeGreaterThan(5000);
    expect(
      effectiveMaxIter(
        { ...DEFAULT_STATE.settings, maxIter: 42 },
        makeView(0, 0, '1e-50'),
      ),
    ).toBe(42);
  });
});
