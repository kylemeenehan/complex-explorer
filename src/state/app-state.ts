/**
 * The complete, shareable state of the explorer, and its URL encoding.
 *
 * URL format (all keys optional; anything missing or malformed falls back to
 * the default, so old or hand-edited links never break the app):
 *
 *   ?m=<re>,<im>,<r>   Mandelbrot view (centre and radius, decimal strings)
 *   &j=<re>,<im>,<r>   Julia view
 *   &c=<re>,<im>       Parameter c (Julia constant / marked Mandelbrot point)
 *   &it=<n|auto>       Max iterations
 *   &R=<n>             Bailout radius used for colouring
 *   &pal=<id>&pd=<density>&po=<offset>&sm=0   Colouring
 *   &grid=0|1&orbit=0|1&follow=0|1
 *
 * Decimal strings carry as many digits as the zoom depth requires.
 */
import { BigFloat, type BigComplex } from '../math/bigfloat';
import {
  centerDigits,
  makeView,
  MAX_RADIUS,
  type View,
} from '../math/viewport';
import { isPaletteId, type PaletteId } from '../render/palettes';

export type Settings = {
  maxIter: number | 'auto';
  bailout: number;
  palette: PaletteId;
  density: number;
  offset: number;
  smooth: boolean;
  grid: boolean;
  orbit: boolean;
  /** In linked views, hovering over the Mandelbrot set moves c. */
  follow: boolean;
};

export type AppState = {
  m: View;
  j: View;
  c: BigComplex;
  settings: Settings;
};

export type PageKind = 'mandelbrot' | 'julia' | 'explore';

export const DEFAULT_MANDELBROT_VIEW: View = makeView(-0.5, 0, 1.25);
export const DEFAULT_JULIA_VIEW: View = makeView(0, 0, 1.6);

export const DEFAULT_SETTINGS: Settings = {
  maxIter: 'auto',
  bailout: 256,
  palette: 'ultra',
  density: 1,
  offset: 0,
  smooth: true,
  grid: false,
  orbit: true,
  follow: false,
};

export const DEFAULT_STATE: AppState = {
  m: DEFAULT_MANDELBROT_VIEW,
  j: DEFAULT_JULIA_VIEW,
  c: { re: BigFloat.from('-0.8'), im: BigFloat.from('0.156') },
  settings: DEFAULT_SETTINGS,
};

export const MAX_ITER_LIMIT = 1_000_000;

/** Iteration budget actually used for a view. */
export function effectiveMaxIter(settings: Settings, view: View): number {
  if (settings.maxIter !== 'auto') return settings.maxIter;
  const depth = Math.max(0, -view.r.log10());
  return Math.round(Math.min(500 + 150 * depth + 4 * depth * depth, 200_000));
}

function parseView(s: string | null): View | null {
  if (!s) return null;
  const parts = s.split(',');
  if (parts.length !== 3) return null;
  const re = BigFloat.parse(parts[0]);
  const im = BigFloat.parse(parts[1]);
  const r = BigFloat.parse(parts[2]);
  if (!re || !im || !r || r.sign() <= 0) return null;
  if (r.toNumber() > MAX_RADIUS) return null;
  return makeView(re, im, r);
}

export function formatView(v: View): string {
  const digits = centerDigits(v);
  return `${v.re.toString(digits)},${v.im.toString(digits)},${v.r.toString(6)}`;
}

function parseComplex(s: string | null): BigComplex | null {
  if (!s) return null;
  const parts = s.split(',');
  if (parts.length !== 2) return null;
  const re = BigFloat.parse(parts[0]);
  const im = BigFloat.parse(parts[1]);
  return re && im ? { re, im } : null;
}

/** Enough digits to locate c to sub-pixel accuracy in whichever view is deeper. */
export function formatC(c: BigComplex, views: View[]): string {
  const digits = Math.max(17, ...views.map(centerDigits));
  return `${c.re.toString(digits)},${c.im.toString(digits)}`;
}

function parseNumber(
  s: string | null,
  min: number,
  max: number,
): number | null {
  if (s === null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function parseBool(s: string | null): boolean | null {
  return s === '1' ? true : s === '0' ? false : null;
}

export function parseState(search: string, base = DEFAULT_STATE): AppState {
  const q = new URLSearchParams(search);
  const d = base.settings;
  const it = q.get('it');
  const maxIter =
    it === 'auto' ? 'auto' : (parseNumber(it, 1, MAX_ITER_LIMIT) ?? d.maxIter);
  const pal = q.get('pal');
  return {
    m: parseView(q.get('m')) ?? base.m,
    j: parseView(q.get('j')) ?? base.j,
    c: parseComplex(q.get('c')) ?? base.c,
    settings: {
      maxIter: typeof maxIter === 'number' ? Math.round(maxIter) : maxIter,
      bailout: parseNumber(q.get('R'), 2, 1e10) ?? d.bailout,
      palette: pal && isPaletteId(pal) ? pal : d.palette,
      density: parseNumber(q.get('pd'), 0.001, 1000) ?? d.density,
      offset: parseNumber(q.get('po'), 0, 1) ?? d.offset,
      smooth: parseBool(q.get('sm')) ?? d.smooth,
      grid: parseBool(q.get('grid')) ?? d.grid,
      orbit: parseBool(q.get('orbit')) ?? d.orbit,
      follow: parseBool(q.get('follow')) ?? d.follow,
    },
  };
}

export function pathFor(page: PageKind) {
  return `/${page}`;
}

/** Which parts of the state each page shows (and so puts in its URL). */
export function pageKeys(page: PageKind): ('m' | 'j' | 'c')[] {
  switch (page) {
    case 'mandelbrot':
      return ['m', 'c'];
    case 'julia':
      return ['j', 'c'];
    case 'explore':
      return ['m', 'j', 'c'];
  }
}

export function serializeState(state: AppState, page: PageKind): string {
  const q = new URLSearchParams();
  const keys = pageKeys(page);
  if (keys.includes('m')) q.set('m', formatView(state.m));
  if (keys.includes('j')) q.set('j', formatView(state.j));
  const views = [
    ...(keys.includes('m') ? [state.m] : []),
    ...(keys.includes('j') ? [state.j] : []),
  ];
  if (keys.includes('c')) q.set('c', formatC(state.c, views));
  const s = state.settings;
  const d = DEFAULT_SETTINGS;
  if (s.maxIter !== d.maxIter) q.set('it', String(s.maxIter));
  if (s.bailout !== d.bailout) q.set('R', String(s.bailout));
  if (s.palette !== d.palette) q.set('pal', s.palette);
  if (s.density !== d.density) q.set('pd', String(s.density));
  if (s.offset !== d.offset) q.set('po', String(s.offset));
  if (s.smooth !== d.smooth) q.set('sm', s.smooth ? '1' : '0');
  if (s.grid !== d.grid) q.set('grid', s.grid ? '1' : '0');
  if (s.orbit !== d.orbit) q.set('orbit', s.orbit ? '1' : '0');
  if (s.follow !== d.follow) q.set('follow', s.follow ? '1' : '0');
  // Commas are safe in query strings; keep links readable.
  return q.toString().replace(/%2C/g, ',');
}
