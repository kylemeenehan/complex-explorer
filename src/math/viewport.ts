/**
 * The mapping between screen pixels and the complex plane.
 *
 * Conventions (shared with the shaders, see src/render/shaders):
 * - A view is a centre (re, im) and a radius `r`: the distance from the centre
 *   to the edge of the *shorter* side of the canvas. So the shorter side always
 *   spans exactly 2r, and wider/taller canvases simply show more.
 * - Pixel coordinates are CSS pixels with the origin at the top-left, y down.
 *   The complex plane is y-up, so moving down the screen decreases Im.
 * - Every function here is pure and works at any depth (BigFloat throughout).
 */
import { BigFloat, type BigComplex } from './bigfloat';

export type View = { re: BigFloat; im: BigFloat; r: BigFloat };
export type Size = { width: number; height: number };

/** Largest radius we allow zooming out to. */
export const MAX_RADIUS = 16;

export function makeView(
  re: number | string | BigFloat,
  im: number | string | BigFloat,
  r: number | string | BigFloat,
): View {
  return {
    re: BigFloat.from(re),
    im: BigFloat.from(im),
    r: BigFloat.from(r).roundRel(53),
  };
}

/**
 * Bits of absolute precision to keep in the centre: enough to place the centre
 * to well under 1/1000 of a pixel at this zoom.
 */
export function centerBits(r: BigFloat): number {
  return Math.max(64, Math.ceil(-r.log2()) + 48);
}

/** Complex units per CSS pixel. */
export function pixelSize(view: View, size: Size): BigFloat {
  return view.r.mulNumber(2 / Math.min(size.width, size.height)).roundRel(53);
}

function roundCenter(re: BigFloat, im: BigFloat, r: BigFloat): View {
  const bits = centerBits(r);
  return { re: re.roundAbs(bits), im: im.roundAbs(bits), r };
}

/** The complex point under the CSS pixel (px, py). */
export function pixelToComplex(
  view: View,
  size: Size,
  px: number,
  py: number,
): BigComplex {
  const ps = pixelSize(view, size);
  const bits = centerBits(view.r) + 8;
  return {
    re: view.re.add(ps.mulNumber(px - size.width / 2)).roundAbs(bits),
    im: view.im.sub(ps.mulNumber(py - size.height / 2)).roundAbs(bits),
  };
}

/** The CSS pixel position of a complex point (may be off-canvas). */
export function complexToPixel(
  view: View,
  size: Size,
  z: BigComplex,
): { x: number; y: number } {
  const ps = pixelSize(view, size);
  // Subtract in full precision first; the ratio to the pixel size is then a
  // modest number even when both are far below float64 range.
  const dx = ratio(z.re.sub(view.re), ps);
  const dy = ratio(z.im.sub(view.im), ps);
  return { x: size.width / 2 + dx, y: size.height / 2 - dy };
}

/** a / b as a float64, valid even when a and b themselves underflow. */
export function ratio(a: BigFloat, b: BigFloat): number {
  const fa = a.toFloatExp();
  const fb = b.toFloatExp();
  if (fa.mant === 0) return 0;
  return (fa.mant / fb.mant) * 2 ** (fa.exp - fb.exp);
}

/** Move the view so content follows a drag of (dx, dy) CSS pixels. */
export function panByPixels(
  view: View,
  size: Size,
  dx: number,
  dy: number,
): View {
  const ps = pixelSize(view, size);
  return roundCenter(
    view.re.sub(ps.mulNumber(dx)),
    view.im.add(ps.mulNumber(dy)),
    view.r,
  );
}

function clampRadius(r: BigFloat): BigFloat {
  return r.cmp(BigFloat.fromNumber(MAX_RADIUS)) > 0
    ? BigFloat.fromNumber(MAX_RADIUS)
    : r;
}

/**
 * Scale the radius by `factor` (<1 zooms in) keeping the complex point under
 * the CSS pixel (px, py) fixed on screen.
 */
export function zoomAt(
  view: View,
  size: Size,
  px: number,
  py: number,
  factor: number,
): View {
  const r = clampRadius(view.r.mulNumber(factor).roundRel(53));
  // Effective factor after clamping.
  const f = ratio(r, view.r);
  const ps = pixelSize(view, size);
  const k = 1 - f;
  return roundCenter(
    view.re.add(ps.mulNumber((px - size.width / 2) * k)),
    view.im.sub(ps.mulNumber((py - size.height / 2) * k)),
    r,
  );
}

/** Zoom about the centre of the view. */
export function zoomBy(view: View, factor: number): View {
  return { ...view, r: clampRadius(view.r.mulNumber(factor).roundRel(53)) };
}

/** Significant decimal digits needed to write the centre to sub-pixel accuracy. */
export function centerDigits(view: View): number {
  return Math.max(6, Math.ceil(-view.r.log10()) + 6);
}

export function viewsEqual(a: View, b: View): boolean {
  return a.re.equals(b.re) && a.im.equals(b.im) && a.r.equals(b.r);
}

/** Human-friendly zoom magnification relative to r = 2. */
export function magnification(view: View): string {
  const log10 = Math.log10(2) - view.r.log10();
  if (log10 < 3)
    return `${(10 ** log10).toPrecision(3).replace(/\.?0+$/, '')}×`;
  const exp = Math.floor(log10);
  const mant = 10 ** (log10 - exp);
  return `${mant.toFixed(2)}×10^${exp}`;
}
