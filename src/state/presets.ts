/**
 * Named places worth showing a class. Mandelbrot locations set the Mandelbrot
 * view (and put c at its centre); Julia presets set c and reset the Julia view.
 */
import { bigComplex } from '../math/bigfloat';
import { makeView } from '../math/viewport';
import {
  DEFAULT_JULIA_VIEW,
  DEFAULT_MANDELBROT_VIEW,
  type AppState,
  type PageKind,
} from './app-state';

export type Preset = {
  id: string;
  name: string;
  description: string;
  group: 'Mandelbrot set' | 'Julia sets';
  /** Page to open when chosen from the home page or a page that can't show it. */
  page: PageKind;
  apply: (s: AppState) => AppState;
};

function mandelbrotSpot(re: string, im: string, r: string) {
  return (s: AppState): AppState => ({
    ...s,
    m: makeView(re, im, r),
    c: bigComplex(re, im),
  });
}

function juliaFor(re: string, im: string) {
  return (s: AppState): AppState => ({
    ...s,
    c: bigComplex(re, im),
    j: DEFAULT_JULIA_VIEW,
  });
}

export const PRESETS: Preset[] = [
  {
    id: 'whole',
    name: 'The whole set',
    description: 'The main cardioid, the period-2 bulb and the antenna to −2.',
    group: 'Mandelbrot set',
    page: 'mandelbrot',
    apply: (s) => ({ ...s, m: DEFAULT_MANDELBROT_VIEW }),
  },
  {
    id: 'seahorse',
    name: 'Seahorse Valley',
    description:
      'Spirals in the cleft between the cardioid and the period-2 bulb.',
    group: 'Mandelbrot set',
    page: 'mandelbrot',
    apply: mandelbrotSpot('-0.7453', '0.1127', '0.0065'),
  },
  {
    id: 'elephant',
    name: 'Elephant Valley',
    description: 'Trunks curling out of the cusp side of the main cardioid.',
    group: 'Mandelbrot set',
    page: 'mandelbrot',
    apply: mandelbrotSpot('0.2925', '0.0149', '0.0065'),
  },
  {
    id: 'misiurewicz-i',
    name: 'Misiurewicz point c = i',
    description:
      'The critical orbit is preperiodic: 0 → i → −1+i → −i → −1+i → …',
    group: 'Mandelbrot set',
    page: 'explore',
    apply: (s) => ({
      ...mandelbrotSpot('0', '1', '0.05')(s),
      j: DEFAULT_JULIA_VIEW,
    }),
  },
  {
    id: 'feigenbaum',
    name: 'Feigenbaum point',
    description:
      'Where the period-doubling cascade on the real axis accumulates.',
    group: 'Mandelbrot set',
    page: 'mandelbrot',
    apply: mandelbrotSpot('-1.401155189092051', '0', '0.0004'),
  },
  {
    id: 'minibrot',
    name: 'Mini Mandelbrot on the antenna',
    description:
      'A small copy of the whole set at c ≈ −1.7549, the period-3 "airplane" component.',
    group: 'Mandelbrot set',
    page: 'mandelbrot',
    apply: mandelbrotSpot('-1.7548776662466927', '0', '0.012'),
  },
  {
    id: 'deep-seahorse',
    name: 'Deep zoom: Seahorse spiral at 10²⁵×',
    description:
      'Spirals within spirals, 25 orders of magnitude down. Needs ~20,000 iterations.',
    group: 'Mandelbrot set',
    page: 'mandelbrot',
    apply: mandelbrotSpot(
      '-0.743643887037158704752191506114774',
      '0.131825904205311970493132056385139',
      '1e-25',
    ),
  },
  {
    id: 'deep-dendrite',
    name: "Tan Lei's theorem: c = i at 10¹⁰⁰×",
    description:
      'Near a Misiurewicz point c, M looks like J_c near c (up to rotation and scale) at every scale. Both panes are zoomed 10¹⁰⁰× into i.',
    group: 'Mandelbrot set',
    page: 'explore',
    apply: (s) => ({
      ...mandelbrotSpot('0', '1', '1e-100')(s),
      j: makeView('0', '1', '1e-100'),
    }),
  },
  {
    id: 'rabbit',
    name: 'Douady rabbit',
    description:
      'c at the centre of the period-3 bulb: a superattracting 3-cycle.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('-0.12256116687665', '0.74486176661974'),
  },
  {
    id: 'basilica',
    name: 'Basilica',
    description: 'c = −1, the centre of the period-2 bulb.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('-1', '0'),
  },
  {
    id: 'san-marco',
    name: 'San Marco',
    description:
      'c = −3/4, the parabolic point where the cardioid meets the period-2 bulb.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('-0.75', '0'),
  },
  {
    id: 'cauliflower',
    name: 'Cauliflower',
    description: 'c = 1/4, the parabolic cusp of the main cardioid.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('0.25', '0'),
  },
  {
    id: 'dendrite',
    name: 'Dendrite',
    description: 'c = i: a Julia set with no interior.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('0', '1'),
  },
  {
    id: 'siegel',
    name: 'Siegel disk',
    description:
      'Irrationally indifferent fixed point with golden-mean rotation number.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('-0.390540870218399', '-0.586787907346969'),
  },
  {
    id: 'airplane',
    name: 'Airplane',
    description: 'c ≈ −1.7549, a real superattracting 3-cycle.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('-1.7548776662466927', '0'),
  },
  {
    id: 'cantor-dust',
    name: 'Cantor dust',
    description:
      'c outside the Mandelbrot set, so the Julia set is totally disconnected.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('0.36', '0.36'),
  },
  {
    id: 'spiral',
    name: 'Spiral',
    description:
      'c = −0.8 + 0.156i, just outside the set near Seahorse Valley.',
    group: 'Julia sets',
    page: 'julia',
    apply: juliaFor('-0.8', '0.156'),
  },
];
