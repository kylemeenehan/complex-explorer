/**
 * Pan/zoom gesture logic, independent of the DOM so it can be unit tested.
 *
 * Design choices that make dragging feel "attached" to the pointer:
 * - Absolute anchoring: a drag computes the view from the view and pointer
 *   position at the *start* of the gesture, not by accumulating per-event
 *   deltas, so rounding never drifts and the grabbed point stays under the
 *   pointer.
 * - Pinch zooms about the midpoint of the two fingers and pans with it.
 * - Whenever the number of active pointers changes, the gesture re-anchors to
 *   the current view, so lifting one finger mid-pinch never makes the view jump.
 * - Wheel zoom keeps the point under the cursor fixed, and its rate is
 *   proportional to the scroll distance (smooth on trackpads, sensible on
 *   notched wheels).
 */
import { panByPixels, zoomAt, type Size, type View } from '../math/viewport';

export type Point = { x: number; y: number };

export interface GestureCallbacks {
  getView(): View;
  getSize(): Size;
  setView(view: View): void;
  /** A click/tap that didn't move. */
  onTap?(p: Point): void;
  /** Mouse moving with no button held; null when it leaves. */
  onHover?(p: Point | null): void;
  /** Return true if a press at p grabs a draggable handle instead of panning. */
  hitHandle?(p: Point): boolean;
  onHandleDrag?(p: Point): void;
  onReset?(): void;
}

/** Movement (CSS px) below which a press counts as a tap, not a drag. */
export const TAP_SLOP = 4;
/** Wheel pixels per doubling of the radius. */
export const WHEEL_PX_PER_OCTAVE = 400;
export const PINCH_WHEEL_PX_PER_OCTAVE = 100;
export const KEY_ZOOM = 1.5;

type Mode =
  | { kind: 'none' }
  | { kind: 'pan'; view: View; start: Point; active: boolean }
  | { kind: 'pinch'; view: View; mid: Point; dist: number }
  | { kind: 'handle' };

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class GestureController {
  private pointers = new Map<number, Point>();
  private mode: Mode = { kind: 'none' };
  private tapCandidate: { id: number; start: Point } | null = null;
  private cb: GestureCallbacks;

  constructor(callbacks: GestureCallbacks) {
    this.cb = callbacks;
  }

  setCallbacks(callbacks: GestureCallbacks) {
    this.cb = callbacks;
  }

  get activePointers() {
    return this.pointers.size;
  }

  pointerDown(id: number, p: Point) {
    this.pointers.set(id, p);
    if (this.pointers.size === 1) {
      this.tapCandidate = { id, start: p };
      if (this.cb.hitHandle?.(p)) {
        this.mode = { kind: 'handle' };
        this.cb.onHandleDrag?.(p);
        return;
      }
    } else {
      this.tapCandidate = null;
    }
    this.reanchor();
  }

  pointerMove(id: number, p: Point) {
    if (!this.pointers.has(id)) {
      if (this.pointers.size === 0) this.cb.onHover?.(p);
      return;
    }
    this.pointers.set(id, p);
    const tap = this.tapCandidate;
    if (tap && distance(tap.start, p) > TAP_SLOP) this.tapCandidate = null;

    const mode = this.mode;
    if (mode.kind === 'handle') {
      this.cb.onHandleDrag?.(p);
    } else if (mode.kind === 'pan') {
      if (!mode.active && distance(mode.start, p) <= TAP_SLOP) return;
      mode.active = true;
      this.cb.setView(
        panByPixels(
          mode.view,
          this.cb.getSize(),
          p.x - mode.start.x,
          p.y - mode.start.y,
        ),
      );
    } else if (mode.kind === 'pinch') {
      const [a, b] = [...this.pointers.values()];
      const mid = midpoint(a, b);
      const dist = Math.max(distance(a, b), 1);
      const size = this.cb.getSize();
      // Keep the complex point that was under the starting midpoint under the
      // current midpoint, scaled by the change in finger separation.
      const zoomed = zoomAt(
        mode.view,
        size,
        mode.mid.x,
        mode.mid.y,
        mode.dist / dist,
      );
      this.cb.setView(
        panByPixels(zoomed, size, mid.x - mode.mid.x, mid.y - mode.mid.y),
      );
    }
  }

  pointerUp(id: number, p: Point, cancelled = false) {
    if (!this.pointers.has(id)) return;
    this.pointers.delete(id);
    const tap = this.tapCandidate;
    const wasHandle = this.mode.kind === 'handle';
    if (this.pointers.size === 0) {
      this.mode = { kind: 'none' };
      this.tapCandidate = null;
      if (!cancelled && tap && tap.id === id && !wasHandle) this.cb.onTap?.(p);
    } else {
      this.reanchor();
    }
  }

  pointerLeave() {
    if (this.pointers.size === 0) this.cb.onHover?.(null);
  }

  /** deltaY in CSS pixels (positive = scroll down = zoom out). */
  wheel(p: Point, deltaY: number, pinch = false) {
    const perOctave = pinch ? PINCH_WHEEL_PX_PER_OCTAVE : WHEEL_PX_PER_OCTAVE;
    const clamped = Math.max(-300, Math.min(300, deltaY));
    this.zoomAtPoint(p, 2 ** (clamped / perOctave));
    // Keep any drag in progress consistent with the new view.
    if (this.pointers.size > 0) this.reanchor();
  }

  zoomAtPoint(p: Point, factor: number) {
    this.cb.setView(
      zoomAt(this.cb.getView(), this.cb.getSize(), p.x, p.y, factor),
    );
  }

  zoomAtCentre(factor: number) {
    const { width, height } = this.cb.getSize();
    this.zoomAtPoint({ x: width / 2, y: height / 2 }, factor);
  }

  /** Returns true if the key was handled. */
  key(key: string, shift = false): boolean {
    const size = this.cb.getSize();
    const step = (Math.min(size.width, size.height) / 10) * (shift ? 4 : 1);
    const pan = (dx: number, dy: number) =>
      this.cb.setView(panByPixels(this.cb.getView(), size, dx, dy));
    switch (key) {
      case 'ArrowLeft':
        pan(step, 0);
        return true;
      case 'ArrowRight':
        pan(-step, 0);
        return true;
      case 'ArrowUp':
        pan(0, step);
        return true;
      case 'ArrowDown':
        pan(0, -step);
        return true;
      case '+':
      case '=':
        this.zoomAtCentre(1 / KEY_ZOOM);
        return true;
      case '-':
      case '_':
        this.zoomAtCentre(KEY_ZOOM);
        return true;
      case '0':
        this.cb.onReset?.();
        return true;
      default:
        return false;
    }
  }

  private reanchor() {
    const pts = [...this.pointers.values()];
    const view = this.cb.getView();
    if (pts.length === 1) {
      this.mode = {
        kind: 'pan',
        view,
        start: pts[0],
        active: this.mode.kind === 'pinch',
      };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      this.mode = {
        kind: 'pinch',
        view,
        mid: midpoint(a, b),
        dist: Math.max(distance(a, b), 1),
      };
    } else {
      this.mode = { kind: 'none' };
    }
  }
}
