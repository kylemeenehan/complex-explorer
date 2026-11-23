/**
 * Colour palettes. Each palette is a cyclic gradient sampled into a 256-texel
 * texture; the shader looks up fract(offset + density · ν / 64), where ν is the
 * (smooth) iteration count. So with density 1, one palette cycle = 64 iterations.
 */

export type PaletteId =
  | 'classic'
  | 'ultra'
  | 'fire'
  | 'ocean'
  | 'grey'
  | 'zebra';

type Stop = [position: number, hex: string];

export const PALETTES: Record<
  PaletteId,
  { label: string; stops: Stop[] | 'hsv' }
> = {
  classic: { label: 'Classic rainbow', stops: 'hsv' },
  ultra: {
    label: 'Ultra',
    stops: [
      [0, '#000764'],
      [0.16, '#206bcb'],
      [0.42, '#edffff'],
      [0.6425, '#ffaa00'],
      [0.8575, '#000200'],
      [1, '#000764'],
    ],
  },
  fire: {
    label: 'Fire',
    stops: [
      [0, '#000000'],
      [0.25, '#7a0000'],
      [0.5, '#ff5a00'],
      [0.75, '#ffe066'],
      [0.9, '#ffffff'],
      [1, '#000000'],
    ],
  },
  ocean: {
    label: 'Ocean',
    stops: [
      [0, '#00111f'],
      [0.3, '#005f73'],
      [0.55, '#94d2bd'],
      [0.75, '#e9f5db'],
      [1, '#00111f'],
    ],
  },
  grey: {
    label: 'Greyscale',
    stops: [
      [0, '#000000'],
      [0.5, '#ffffff'],
      [1, '#000000'],
    ],
  },
  zebra: {
    label: 'Zebra (level sets)',
    stops: [
      [0, '#ffffff'],
      [0.499, '#ffffff'],
      [0.5, '#000000'],
      [0.999, '#000000'],
      [1, '#ffffff'],
    ],
  },
};

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

export function isPaletteId(s: string): s is PaletteId {
  return s in PALETTES;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

export const PALETTE_SIZE = 256;

/** RGBA8 texels for a palette, PALETTE_SIZE wide. */
export function buildPalette(id: PaletteId): Uint8Array {
  const out = new Uint8Array(PALETTE_SIZE * 4);
  const { stops } = PALETTES[id];
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const t = i / PALETTE_SIZE;
    let rgb: [number, number, number];
    if (stops === 'hsv') {
      rgb = hsvToRgb(t, 1, 1);
    } else {
      let j = 0;
      while (j < stops.length - 2 && stops[j + 1][0] <= t) j++;
      const [p0, c0] = stops[j];
      const [p1, c1] = stops[j + 1];
      const u = p1 > p0 ? (t - p0) / (p1 - p0) : 0;
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      rgb = [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u) as typeof rgb;
    }
    out.set([...rgb.map(Math.round), 255], i * 4);
  }
  return out;
}
