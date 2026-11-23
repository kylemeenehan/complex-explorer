import { describe, expect, it, vi } from 'vitest';
import { makeView, pixelToComplex, type View } from '../math/viewport';
import { GestureController, type Point } from './gestures';

const size = { width: 800, height: 600 };

function setup(initial: View = makeView(-0.5, 0, 1.25)) {
  let view = initial;
  const onTap = vi.fn();
  const onHover = vi.fn();
  const g = new GestureController({
    getView: () => view,
    getSize: () => size,
    setView: (v) => {
      view = v;
    },
    onTap,
    onHover,
  });
  const at = (p: Point) => pixelToComplex(view, size, p.x, p.y);
  return {
    g,
    get view() {
      return view;
    },
    at,
    onTap,
    onHover,
  };
}

function expectSamePoint(
  a: ReturnType<typeof setup>['at'] extends (p: Point) => infer R ? R : never,
  b: typeof a,
  view: View,
) {
  const tol = view.r.mulNumber(1e-9).toNumber();
  expect(Math.abs(a.re.sub(b.re).toNumber())).toBeLessThan(tol);
  expect(Math.abs(a.im.sub(b.im).toNumber())).toBeLessThan(tol);
}

describe('GestureController', () => {
  it('keeps the grabbed point under the pointer while dragging', () => {
    const s = setup();
    const grabbed = s.at({ x: 100, y: 100 });
    s.g.pointerDown(1, { x: 100, y: 100 });
    for (let i = 1; i <= 50; i++)
      s.g.pointerMove(1, { x: 100 + i * 7.3, y: 100 + i * 3.1 });
    expectSamePoint(
      s.at({ x: 100 + 50 * 7.3, y: 100 + 50 * 3.1 }),
      grabbed,
      s.view,
    );
    s.g.pointerUp(1, { x: 465, y: 255 });
    expect(s.onTap).not.toHaveBeenCalled();
  });

  it('treats a press without movement as a tap', () => {
    const s = setup();
    const before = s.view;
    s.g.pointerDown(1, { x: 10, y: 10 });
    s.g.pointerMove(1, { x: 12, y: 11 });
    s.g.pointerUp(1, { x: 12, y: 11 });
    expect(s.onTap).toHaveBeenCalledWith({ x: 12, y: 11 });
    expect(s.view).toBe(before);
  });

  it('reports hover only when no button is down', () => {
    const s = setup();
    s.g.pointerMove(1, { x: 5, y: 5 });
    expect(s.onHover).toHaveBeenCalledWith({ x: 5, y: 5 });
  });

  it('wheel zoom keeps the cursor point fixed and is proportional to scroll', () => {
    const s = setup();
    const p = { x: 650, y: 120 };
    const before = s.at(p);
    const r0 = s.view.r.toNumber();
    s.g.wheel(p, -200);
    s.g.wheel(p, -200);
    expect(s.view.r.toNumber()).toBeCloseTo(r0 / 2, 12);
    expectSamePoint(s.at(p), before, s.view);
    // Many small trackpad deltas compose to the same zoom as one big one.
    for (let i = 0; i < 40; i++) s.g.wheel(p, 10);
    expect(s.view.r.toNumber()).toBeCloseTo(r0, 10);
  });

  it('pinch zooms about the finger midpoint and pans with it', () => {
    const s = setup();
    const a0 = { x: 300, y: 300 };
    const b0 = { x: 500, y: 300 };
    const under = s.at({ x: 400, y: 300 });
    s.g.pointerDown(1, a0);
    s.g.pointerDown(2, b0);
    // Spread fingers to twice the distance while moving the midpoint.
    s.g.pointerMove(1, { x: 250, y: 350 });
    s.g.pointerMove(2, { x: 650, y: 350 });
    expect(s.view.r.toNumber()).toBeCloseTo(1.25 / 2, 10);
    expectSamePoint(s.at({ x: 450, y: 350 }), under, s.view);
  });

  it('does not jump when a finger lifts mid-pinch', () => {
    const s = setup();
    s.g.pointerDown(1, { x: 300, y: 300 });
    s.g.pointerDown(2, { x: 500, y: 300 });
    s.g.pointerMove(2, { x: 600, y: 320 });
    s.g.pointerUp(2, { x: 600, y: 320 });
    const after = s.view;
    const grabbed = s.at({ x: 300, y: 300 });
    s.g.pointerMove(1, { x: 301, y: 300 });
    s.g.pointerMove(1, { x: 340, y: 330 });
    expectSamePoint(s.at({ x: 340, y: 330 }), grabbed, s.view);
    expect(s.view.r.equals(after.r)).toBe(true);
    s.g.pointerUp(1, { x: 340, y: 330 });
    expect(s.onTap).not.toHaveBeenCalled();
  });

  it('handles keyboard navigation', () => {
    const s = setup();
    const r0 = s.view.r.toNumber();
    expect(s.g.key('+')).toBe(true);
    expect(s.view.r.toNumber()).toBeCloseTo(r0 / 1.5, 12);
    const re0 = s.view.re.toNumber();
    s.g.key('ArrowRight');
    expect(s.view.re.toNumber()).toBeGreaterThan(re0);
    expect(s.g.key('x')).toBe(false);
  });

  it('drags a handle instead of panning when one is hit', () => {
    const drags: Point[] = [];
    let view = makeView(0, 0, 1);
    const g = new GestureController({
      getView: () => view,
      getSize: () => size,
      setView: (v) => (view = v),
      hitHandle: (p) => p.x < 50,
      onHandleDrag: (p) => drags.push(p),
    });
    const before = view;
    g.pointerDown(1, { x: 10, y: 10 });
    g.pointerMove(1, { x: 100, y: 100 });
    g.pointerUp(1, { x: 100, y: 100 });
    expect(view).toBe(before);
    expect(drags).toEqual([
      { x: 10, y: 10 },
      { x: 100, y: 100 },
    ]);
  });
});
