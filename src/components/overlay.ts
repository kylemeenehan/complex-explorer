/**
 * 2D overlay drawn over the fractal: axes and grid with labels, the parameter
 * marker c, and orbits. All positions go through src/math/viewport.ts so they
 * line up exactly with the GPU render.
 */
import type { BigComplex } from '../math/bigfloat';
import type { Complex } from '../math/iterate';
import {
  complexToPixel,
  pixelSize,
  type Size,
  type View,
} from '../math/viewport';

export type OverlayOptions = {
  view: View;
  size: Size;
  grid: boolean;
  marker: BigComplex | null;
  markerLabel: string;
  orbit: Complex[] | null;
};

/** Below this radius a float64 grid can't be labelled meaningfully. */
const GRID_MIN_RADIUS = 1e-11;

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

function formatTick(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = (Math.abs(v) < step / 2 ? 0 : v).toFixed(decimals);
  return s.replace('-', '−');
}

function drawGrid(ctx: CanvasRenderingContext2D, view: View, size: Size) {
  if (view.r.toNumber() < GRID_MIN_RADIUS) return;
  const ps = pixelSize(view, size).toNumber();
  const cx = view.re.toNumber();
  const cy = view.im.toNumber();
  const left = cx - (size.width / 2) * ps;
  const right = cx + (size.width / 2) * ps;
  const bottom = cy - (size.height / 2) * ps;
  const top = cy + (size.height / 2) * ps;
  const step = niceStep(ps * 110);
  const toX = (re: number) => (re - cx) / ps + size.width / 2;
  const toY = (im: number) => size.height / 2 - (im - cy) / ps;

  ctx.save();
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.lineWidth = 1;
  // Make sure the axes are inside the visible area before labelling along them.
  const axisY = Math.min(Math.max(toY(0), 14), size.height - 4);
  const axisX = Math.min(Math.max(toX(0), 4), size.width - 60);

  for (let i = Math.ceil(left / step); i * step <= right; i++) {
    const re = i * step;
    const x = Math.round(toX(re)) + 0.5;
    const isAxis = i === 0;
    ctx.strokeStyle = isAxis
      ? 'rgba(255,255,255,0.85)'
      : 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size.height);
    ctx.stroke();
    if (!isAxis) labelled(ctx, formatTick(re, step), x + 3, axisY - 3);
  }
  for (let i = Math.ceil(bottom / step); i * step <= top; i++) {
    const im = i * step;
    const y = Math.round(toY(im)) + 0.5;
    const isAxis = i === 0;
    ctx.strokeStyle = isAxis
      ? 'rgba(255,255,255,0.85)'
      : 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.width, y);
    ctx.stroke();
    if (!isAxis) labelled(ctx, `${formatTick(im, step)}i`, axisX + 3, y - 3);
  }
  ctx.restore();
}

function labelled(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(text, x, y);
  ctx.lineWidth = 1;
}

function drawOrbit(
  ctx: CanvasRenderingContext2D,
  view: View,
  size: Size,
  orbit: Complex[],
) {
  if (orbit.length === 0 || view.r.toNumber() < GRID_MIN_RADIUS) return;
  const ps = pixelSize(view, size).toNumber();
  const cx = view.re.toNumber();
  const cy = view.im.toNumber();
  const pts = orbit.map((z) => ({
    x: (z.re - cx) / ps + size.width / 2,
    y: size.height / 2 - (z.im - cy) / ps,
  }));
  // Keep coordinates finite for the canvas API when the orbit runs off to ∞.
  const LIMIT = 1e6;
  const clampPt = (p: { x: number; y: number }) => ({
    x: Math.max(-LIMIT, Math.min(LIMIT, p.x)),
    y: Math.max(-LIMIT, Math.min(LIMIT, p.y)),
  });
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 2;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = clampPt(p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  pts.forEach((p, i) => {
    if (Math.abs(p.x) > LIMIT || Math.abs(p.y) > LIMIT) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === 0 ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#ffeb3b' : `hsl(${(i * 37) % 360} 90% 65%)`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.restore();
}

export const MARKER_RADIUS = 9;

function drawMarker(
  ctx: CanvasRenderingContext2D,
  view: View,
  size: Size,
  c: BigComplex,
  label: string,
) {
  const p = complexToPixel(view, size, c);
  if (p.x < -50 || p.y < -50 || p.x > size.width + 50 || p.y > size.height + 50)
    return;
  ctx.save();
  ctx.lineWidth = 2;
  for (const [style, width] of [
    ['rgba(0,0,0,0.85)', 4],
    ['#ffeb3b', 2],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.x, p.y, MARKER_RADIUS, 0, Math.PI * 2);
    ctx.moveTo(p.x - MARKER_RADIUS - 5, p.y);
    ctx.lineTo(p.x - 3, p.y);
    ctx.moveTo(p.x + 3, p.y);
    ctx.lineTo(p.x + MARKER_RADIUS + 5, p.y);
    ctx.moveTo(p.x, p.y - MARKER_RADIUS - 5);
    ctx.lineTo(p.x, p.y - 3);
    ctx.moveTo(p.x, p.y + 3);
    ctx.lineTo(p.x, p.y + MARKER_RADIUS + 5);
    ctx.stroke();
  }
  ctx.font = 'italic 600 15px "Times New Roman", serif';
  labelled(ctx, label, p.x + MARKER_RADIUS + 4, p.y - MARKER_RADIUS - 2);
  ctx.restore();
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  o: OverlayOptions,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (o.grid) drawGrid(ctx, o.view, o.size);
  if (o.orbit) drawOrbit(ctx, o.view, o.size, o.orbit);
  if (o.marker) drawMarker(ctx, o.view, o.size, o.marker, o.markerLabel);
}
