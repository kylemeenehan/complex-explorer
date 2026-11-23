import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  GestureController,
  type GestureCallbacks,
  type Point,
} from './gestures';

/** Safari's non-standard trackpad pinch events. */
type GestureEvent = UIEvent & {
  scale: number;
  clientX: number;
  clientY: number;
};

const LINE_HEIGHT_PX = 16;

/**
 * Wire mouse, touch, pen, wheel, trackpad-pinch and keyboard input on `ref`
 * to a GestureController. The element should have `touch-action: none` and a
 * tabIndex so it can take keyboard focus.
 */
export function usePanZoom(
  ref: RefObject<HTMLElement | null>,
  callbacks: GestureCallbacks,
) {
  const controllerRef = useRef<GestureController | null>(null);
  const callbacksRef = useRef(callbacks);
  useLayoutEffect(() => {
    callbacksRef.current = callbacks;
    controllerRef.current?.setCallbacks(callbacks);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = new GestureController(callbacksRef.current);
    controllerRef.current = g;

    // Buttons and cards floating over the view opt out of gestures. (React's
    // stopPropagation can't do this: these native listeners run first.)
    const ignored = (e: Event) =>
      e.target instanceof Element &&
      e.target.closest('[data-gesture-ignore]') !== null;

    const local = (e: { clientX: number; clientY: number }): Point => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (ignored(e)) return;
      el.setPointerCapture(e.pointerId);
      el.focus({ preventScroll: true });
      g.pointerDown(e.pointerId, local(e));
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      // Hovering over floating controls isn't hovering over the plane.
      if (g.activePointers === 0 && ignored(e)) return g.pointerLeave();
      g.pointerMove(e.pointerId, local(e));
    };
    const onPointerUp = (e: PointerEvent) => g.pointerUp(e.pointerId, local(e));
    const onPointerCancel = (e: PointerEvent) =>
      g.pointerUp(e.pointerId, local(e), true);
    const onPointerLeave = () => g.pointerLeave();

    const onWheel = (e: WheelEvent) => {
      if (ignored(e)) return;
      e.preventDefault();
      const scale =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? LINE_HEIGHT_PX
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? el.clientHeight
            : 1;
      // Chrome/Firefox report trackpad pinch as ctrl+wheel.
      g.wheel(local(e), e.deltaY * scale, e.ctrlKey);
    };

    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as GestureEvent;
      g.zoomAtPoint(local(ge), lastScale / ge.scale);
      lastScale = ge.scale;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || ignored(e)) return;
      if (g.key(e.key, e.shiftKey)) e.preventDefault();
    };
    const onDoubleClick = (e: MouseEvent) => {
      if (ignored(e)) return;
      g.zoomAtPoint(local(e), e.shiftKey ? 2 : 0.5);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('dblclick', onDoubleClick);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('dblclick', onDoubleClick);
      controllerRef.current = null;
    };
  }, [ref]);

  return controllerRef;
}
