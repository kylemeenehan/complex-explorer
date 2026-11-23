/**
 * Owns one WebGL2 context and draws Mandelbrot/Julia sets into it.
 *
 * Two rendering paths, chosen per frame:
 * - **direct** (shaders/fractal.frag): plain float32 escape time, used while
 *   the view is shallow enough for float32 coordinates.
 * - **perturb** (shaders/perturb.frag): perturbation against a high-precision
 *   reference orbit computed in a Web Worker. Works at any depth.
 *
 * Frames are rendered progressively. Work goes into an offscreen framebuffer
 * in tiles, centre first, after a quick quarter-resolution preview. A GPU
 * fence measures how much work fits in a frame, so cheap views appear in one
 * frame and very deep views fill in without freezing the page.
 *
 * Other details:
 * - Shaders, buffers and textures are created once, not per frame.
 * - The canvas tracks its CSS size × devicePixelRatio through a ResizeObserver.
 * - The canvas gets `data-render-state="pending" | "done"`, so tests and the
 *   screenshot script can wait for a finished frame.
 */
import type { BigComplex } from '../math/bigfloat';
import type { FractalKind } from '../math/iterate';
import {
  bitsForRadius,
  type OrbitTarget,
  type ReferenceOrbit,
} from '../math/reference-orbit';
import { pixelSize, ratio, type View } from '../math/viewport';
import { resolveIncludes } from './glsl';
import { buildPalette, PALETTE_SIZE, type PaletteId } from './palettes';
import {
  ReferenceComputer,
  type ReferenceProgress,
} from './perturbation/ReferenceComputer';
import vertexSource from './shaders/fullscreen.vert?raw';
import fractalSource from './shaders/fractal.frag?raw';
import perturbSource from './shaders/perturb.frag?raw';
import colourChunk from './shaders/colour.glsl?raw';

export type { FractalKind };

export type RenderParams = {
  kind: FractalKind;
  view: View;
  /** Julia parameter (ignored for the Mandelbrot set). */
  c: BigComplex;
  maxIter: number;
  /**
   * maxIter came from the depth heuristic: deep views may raise it to what
   * sampled pixels need (see suggestMaxIter).
   */
  autoIter?: boolean;
  bailout: number;
  palette: PaletteId;
  density: number;
  offset: number;
  smooth: boolean;
  interior: [number, number, number];
};

/** Views with a smaller radius than this use perturbation. */
const DEEP_LOG2_RADIUS = Math.log2(2e-4);
/** A reference stays usable while the view centre is within this many pixels of it. */
const MAX_REF_OFFSET_PX = 4096;
/** Past this offset a fresh reference is requested in the background. */
const REFRESH_REF_OFFSET_PX = 768;
const ORBIT_TEXTURE_WIDTH = 4096;
const TILE = 256;
const PREVIEW_SCALE = 4;

const CHUNKS = { colour: colourChunk };

type Plan =
  | { mode: 'direct'; params: RenderParams; maxIter: number }
  | {
      mode: 'perturb';
      params: RenderParams;
      maxIter: number;
      orbit: ReferenceOrbit;
      offset: { mant: [number, number]; exp: number };
    };

type Rect = { x: number; y: number; width: number; height: number };

type Job = {
  plan: Plan;
  tiles: Rect[];
  next: number;
  preview: boolean;
  started: boolean;
};

type Target = {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
};

function compile(gl: WebGL2RenderingContext, type: GLenum, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

class Program {
  readonly program: WebGLProgram;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private readonly gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext, vs: string, fs: string) {
    this.gl = gl;
    const program = gl.createProgram();
    const v = compile(gl, gl.VERTEX_SHADER, vs);
    const f = compile(gl, gl.FRAGMENT_SHADER, resolveIncludes(fs, CHUNKS));
    gl.attachShader(program, v);
    gl.attachShader(program, f);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
  }

  loc(name: string) {
    if (!this.locations.has(name)) {
      this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.locations.get(name)!;
  }
}

/** Does this view need perturbation? */
export function isDeep(view: View): boolean {
  return view.r.log2() < DEEP_LOG2_RADIUS;
}

/** The reference orbit to ask for when rendering `params` (with headroom). */
export function referenceTargetFor(params: RenderParams): OrbitTarget {
  return {
    kind: params.kind,
    ref: { re: params.view.re, im: params.view.im },
    c: params.c,
    // In auto mode, compute far enough to discover how many iterations the
    // view really needs.
    maxIter: params.autoIter
      ? Math.min(Math.max(params.maxIter * 4, 20_000), MAX_AUTO_ITER)
      : Math.ceil(Math.max(params.maxIter * 1.25, 1000)),
    bailout: params.bailout,
    bits: bitsForRadius(params.view.r, 64),
    sampleRadius: params.autoIter ? params.view.r.toNumber() : undefined,
  };
}

/** Upper bound for automatically chosen iteration counts. */
export const MAX_AUTO_ITER = 400_000;

type Size = { width: number; height: number };

/** How far (in pixels) the view centre is from a reference point. */
function offsetPixels(target: OrbitTarget, params: RenderParams, size: Size) {
  const ps = pixelSize(params.view, size);
  return Math.max(
    Math.abs(ratio(params.view.re.sub(target.ref.re), ps)),
    Math.abs(ratio(params.view.im.sub(target.ref.im), ps)),
  );
}

/** Can a reference (or a pending request for one) render these params? */
export function referenceUsable(
  target: OrbitTarget | ReferenceOrbit,
  params: RenderParams,
  size: Size,
  maxOffset = MAX_REF_OFFSET_PX,
): boolean {
  if (target.kind !== params.kind) return false;
  if (
    params.kind === 'julia' &&
    !(target.c.re.equals(params.c.re) && target.c.im.equals(params.c.im))
  ) {
    return false;
  }
  if (target.bits < bitsForRadius(params.view.r)) return false;
  if (params.bailout > Math.max(target.bailout, 1e4)) return false;
  // A reference that escaped before its iteration limit serves any limit.
  const finished =
    'lenA' in target &&
    target.lenA <= target.maxIter &&
    target.lenB <= target.maxIter;
  if (target.maxIter < params.maxIter && !finished) return false;
  return offsetPixels(target, params, size) < maxOffset;
}

export type RendererOptions = {
  /** Track the canvas's CSS size (default true). Off for offscreen export. */
  autoResize?: boolean;
  preserveDrawingBuffer?: boolean;
  onError?: (error: Error) => void;
  /** Progress of the reference orbit computation (null when idle). */
  onReferenceProgress?: (p: ReferenceProgress) => void;
  /** The iteration limit actually used, whenever it changes. */
  onIterations?: (maxIter: number) => void;
};

export class FractalRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private direct!: Program;
  private perturb!: Program;
  private vao!: WebGLVertexArrayObject;
  private buffer!: WebGLBuffer;
  private paletteTex!: WebGLTexture;
  private orbitTex!: WebGLTexture;
  private main: Target | null = null;
  private preview: Target | null = null;
  private loadedPalette: PaletteId | null = null;
  private params: RenderParams | null = null;
  private orbit: ReferenceOrbit | null = null;
  private readonly references: ReferenceComputer;
  private job: Job | null = null;
  private dirty = false;
  private fence: WebGLSync | null = null;
  private fenceFrames = 0;
  /** Tiles per frame; adapts to what the GPU manages within a frame. */
  private batch = 16;
  private frame = 0;
  private resizeObserver?: ResizeObserver;
  private disposed = false;
  private readonly onError: (error: Error) => void;
  private orbitWaiters: (() => void)[] = [];
  private readonly onIterations: (maxIter: number) => void;
  private reportedIterations = 0;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.onError = options.onError ?? ((e) => console.error(e));
    this.onIterations = options.onIterations ?? (() => {});
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.init();
    this.references = new ReferenceComputer(
      (orbit) => this.setReference(orbit),
      options.onReferenceProgress ?? (() => {}),
    );
    if (import.meta.env.DEV) {
      // Test/debug hook: e2e tests sample rendered pixels through this.
      (
        canvas as HTMLCanvasElement & { __fractal?: FractalRenderer }
      ).__fractal = this;
    }

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    if (options.autoResize ?? true) {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        const dpr = window.devicePixelRatio || 1;
        const box = entry.devicePixelContentBoxSize?.[0];
        const width = box
          ? box.inlineSize
          : Math.round(entry.contentRect.width * dpr);
        const height = box
          ? box.blockSize
          : Math.round(entry.contentRect.height * dpr);
        this.setSize(width, height);
      });
      try {
        this.resizeObserver.observe(canvas, {
          box: 'device-pixel-content-box',
        });
      } catch {
        this.resizeObserver.observe(canvas);
      }
    }
  }

  private init() {
    const gl = this.gl;
    this.direct = new Program(gl, vertexSource, fractalSource);
    this.perturb = new Program(gl, vertexSource, perturbSource);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.loadedPalette = null;

    this.orbitTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.orbit) this.uploadOrbit(this.orbit);

    this.main = null;
    this.preview = null;
    this.fence = null;
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  };

  private handleContextRestored = () => {
    try {
      this.init();
      this.invalidate();
    } catch (err) {
      this.onError(err as Error);
    }
  };

  /** Set the backing-store size in device pixels. */
  setSize(width: number, height: number) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.invalidate();
  }

  setParams(params: RenderParams, { draw = true } = {}) {
    this.params = params;
    if (draw) this.invalidate();
  }

  /** Install a reference orbit (normally called when the worker finishes). */
  setReference(orbit: ReferenceOrbit) {
    if (this.disposed) return;
    this.orbit = orbit;
    this.uploadOrbit(orbit);
    const waiters = this.orbitWaiters;
    this.orbitWaiters = [];
    waiters.forEach((w) => w());
    this.invalidate();
  }

  /** Resolves once the current params can be drawn (a reference orbit is ready if needed). */
  ready(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.plan()) resolve();
        else this.orbitWaiters.push(check);
      };
      check();
    });
  }

  private invalidate() {
    if (this.disposed) return;
    this.dirty = true;
    this.canvas.dataset.renderState = 'pending';
    this.schedule();
  }

  private schedule() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      try {
        this.tick();
      } catch (err) {
        this.onError(err as Error);
      }
    });
  }

  private uploadOrbit(orbit: ReferenceOrbit) {
    const gl = this.gl;
    const points = orbit.data.length / 4;
    const width = Math.min(ORBIT_TEXTURE_WIDTH, Math.max(points, 1));
    const height = Math.ceil(points / width);
    let data = orbit.data;
    if (data.length < width * height * 4) {
      data = new Float32Array(width * height * 4);
      data.set(orbit.data);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      width,
      height,
      0,
      gl.RGBA,
      gl.FLOAT,
      data,
    );
  }

  /** Decide how to draw the current params, requesting a reference orbit if needed. */
  private plan(): Plan | null {
    const params = this.params;
    if (!params) return null;
    if (!isDeep(params.view)) {
      return { mode: 'direct', params, maxIter: params.maxIter };
    }

    const size = {
      width: this.gl.drawingBufferWidth,
      height: this.gl.drawingBufferHeight,
    };
    const pending = this.references.pending;
    const pendingOk =
      pending !== null &&
      referenceUsable(pending, params, size, REFRESH_REF_OFFSET_PX);
    const orbit = this.orbit;
    const usable = orbit !== null && referenceUsable(orbit, params, size);
    const fresh =
      usable &&
      offsetPixels(orbit, params, size) < REFRESH_REF_OFFSET_PX &&
      orbit.bits >= bitsForRadius(params.view.r, 16);
    if (!fresh && !pendingOk) {
      this.references.request(referenceTargetFor(params));
    }
    if (!usable) return null;

    const re = params.view.re.sub(orbit.ref.re).toFloatExp();
    const im = params.view.im.sub(orbit.ref.im).toFloatExp();
    const exp = Math.max(
      re.mant ? re.exp : -Infinity,
      im.mant ? im.exp : -Infinity,
    );
    const offset = Number.isFinite(exp)
      ? {
          mant: [
            re.mant * 2 ** (re.exp - exp),
            im.mant * 2 ** (im.exp - exp),
          ] as [number, number],
          exp,
        }
      : { mant: [0, 0] as [number, number], exp: -100000 };
    let maxIter = params.maxIter;
    if (params.autoIter && orbit.suggestedMaxIter) {
      maxIter = Math.max(maxIter, orbit.suggestedMaxIter);
      // Don't run past the end of an unfinished reference.
      if (orbit.lenA > orbit.maxIter)
        maxIter = Math.min(maxIter, orbit.maxIter);
    }
    return { mode: 'perturb', params, maxIter, orbit, offset };
  }

  private ensureTargets(width: number, height: number) {
    const gl = this.gl;
    const make = (w: number, h: number, old: Target | null): Target => {
      if (old && old.width === w && old.height === h) return old;
      if (old) {
        gl.deleteFramebuffer(old.framebuffer);
        gl.deleteTexture(old.texture);
      }
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { framebuffer, texture, width: w, height: h };
    };
    this.main = make(width, height, this.main);
    this.preview = make(
      Math.max(1, Math.ceil(width / PREVIEW_SCALE)),
      Math.max(1, Math.ceil(height / PREVIEW_SCALE)),
      this.preview,
    );
  }

  /** Bind the program and set every uniform for a plan rendered at width × height. */
  private applyPlan(plan: Plan, width: number, height: number) {
    const gl = this.gl;
    const p = plan.params;
    const prog = plan.mode === 'direct' ? this.direct : this.perturb;
    gl.useProgram(prog.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    if (this.loadedPalette !== p.palette) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        PALETTE_SIZE,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        buildPalette(p.palette),
      );
      this.loadedPalette = p.palette;
    }
    gl.uniform1i(prog.loc('uPalette'), 0);
    gl.uniform1f(prog.loc('uDensity'), p.density);
    gl.uniform1f(prog.loc('uOffset'), p.offset);
    gl.uniform1f(prog.loc('uBailout'), p.bailout);
    gl.uniform1i(prog.loc('uSmooth'), p.smooth ? 1 : 0);
    gl.uniform3f(prog.loc('uInterior'), ...p.interior);
    gl.uniform2f(prog.loc('uResolution'), width, height);
    gl.uniform1i(prog.loc('uKind'), p.kind === 'mandelbrot' ? 0 : 1);
    gl.uniform1i(prog.loc('uMaxIter'), plan.maxIter);
    // Same mapping as src/math/viewport.ts, in this target's pixels.
    const ps = pixelSize(p.view, { width, height });

    if (plan.mode === 'direct') {
      gl.uniform2f(
        prog.loc('uCenter'),
        p.view.re.toNumber(),
        p.view.im.toNumber(),
      );
      gl.uniform1f(prog.loc('uPixelSize'), ps.toNumber());
      gl.uniform2f(prog.loc('uC'), p.c.re.toNumber(), p.c.im.toNumber());
    } else {
      const fe = ps.toFloatExp();
      gl.uniform1f(prog.loc('uPixelMant'), fe.mant);
      gl.uniform1i(prog.loc('uPixelExp'), fe.exp);
      gl.uniform2f(prog.loc('uRefOffsetMant'), ...plan.offset.mant);
      gl.uniform1i(prog.loc('uRefOffsetExp'), plan.offset.exp);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
      gl.uniform1i(prog.loc('uOrbit'), 1);
      gl.uniform1i(
        prog.loc('uOrbitWidth'),
        Math.min(ORBIT_TEXTURE_WIDTH, plan.orbit.data.length / 4),
      );
      gl.uniform1i(prog.loc('uLenA'), plan.orbit.lenA);
      gl.uniform1i(prog.loc('uStartB'), plan.orbit.startB);
      gl.uniform1i(prog.loc('uLenB'), plan.orbit.lenB);
    }
  }

  private makeTiles(width: number, height: number): Rect[] {
    const tiles: Rect[] = [];
    for (let y = 0; y < height; y += TILE) {
      for (let x = 0; x < width; x += TILE) {
        tiles.push({
          x,
          y,
          width: Math.min(TILE, width - x),
          height: Math.min(TILE, height - y),
        });
      }
    }
    const cx = width / 2;
    const cy = height / 2;
    const d = (t: Rect) =>
      Math.hypot(t.x + t.width / 2 - cx, t.y + t.height / 2 - cy);
    return tiles.sort((a, b) => d(a) - d(b));
  }

  private tick() {
    const gl = this.gl;
    if (gl.isContextLost()) return;

    // Don't queue more GPU work until the previous batch has finished.
    if (this.fence) {
      const status = gl.clientWaitSync(this.fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) {
        this.fenceFrames++;
        this.schedule();
        return;
      }
      gl.deleteSync(this.fence);
      this.fence = null;
      // The GPU has finished everything issued, so a completed job is on screen.
      if (!this.job && !this.dirty) this.canvas.dataset.renderState = 'done';
      if (this.fenceFrames === 0) this.batch = Math.min(this.batch * 2, 4096);
      else if (this.fenceFrames > 2) {
        this.batch = Math.max(1, Math.floor(this.batch / 2));
      }
      this.fenceFrames = 0;
    }

    if (this.dirty) {
      const plan = this.plan();
      if (!plan) return; // waiting for a reference orbit; setReference re-triggers
      this.dirty = false;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      this.ensureTargets(width, height);
      if (plan.maxIter !== this.reportedIterations) {
        this.reportedIterations = plan.maxIter;
        this.onIterations(plan.maxIter);
      }
      this.job = {
        plan,
        tiles: this.makeTiles(width, height),
        next: 0,
        preview: false,
        started: false,
      };
    }
    const job = this.job;
    if (!job) return;

    const main = this.main!;
    const remaining = job.tiles.length - job.next;
    if (!job.started && remaining > this.batch) {
      // Too much for one frame: show a quarter-resolution preview first.
      const preview = this.preview!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, preview.framebuffer);
      gl.viewport(0, 0, preview.width, preview.height);
      gl.disable(gl.SCISSOR_TEST);
      this.applyPlan(job.plan, preview.width, preview.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      job.preview = true;
    }
    job.started = true;

    const count = Math.min(this.batch, remaining);
    gl.bindFramebuffer(gl.FRAMEBUFFER, main.framebuffer);
    gl.viewport(0, 0, main.width, main.height);
    this.applyPlan(job.plan, main.width, main.height);
    gl.enable(gl.SCISSOR_TEST);
    for (let i = job.next; i < job.next + count; i++) {
      const t = job.tiles[i];
      gl.scissor(t.x, t.y, t.width, t.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
    job.next += count;
    this.present(job);

    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    if (job.next >= job.tiles.length) this.job = null;
    this.schedule();
  }

  /** Copy what's been rendered so far to the canvas. */
  private present(job: Job) {
    const gl = this.gl;
    const main = this.main!;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    const blitRect = (r: Rect) =>
      gl.blitFramebuffer(
        r.x,
        r.y,
        r.x + r.width,
        r.y + r.height,
        r.x,
        r.y,
        r.x + r.width,
        r.y + r.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
    if (job.next >= job.tiles.length) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, main.framebuffer);
      blitRect({ x: 0, y: 0, width: main.width, height: main.height });
    } else {
      if (job.preview) {
        const preview = this.preview!;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, preview.framebuffer);
        gl.blitFramebuffer(
          0,
          0,
          preview.width,
          preview.height,
          0,
          0,
          main.width,
          main.height,
          gl.COLOR_BUFFER_BIT,
          gl.LINEAR,
        );
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, main.framebuffer);
      for (let i = 0; i < job.next; i++) blitRect(job.tiles[i]);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  /**
   * Draw synchronously into the canvas's own framebuffer (for export and
   * tests). Returns false if a needed reference orbit isn't ready yet.
   */
  drawNow(scissor?: Rect): boolean {
    const gl = this.gl;
    const plan = this.plan();
    if (!plan || gl.isContextLost()) return false;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    this.applyPlan(plan, width, height);
    if (scissor) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    return true;
  }

  /** Which path the current params use. */
  get mode(): 'direct' | 'perturb' | null {
    if (!this.params) return null;
    return isDeep(this.params.view) ? 'perturb' : 'direct';
  }

  /**
   * Render now and read back RGB at CSS-pixel positions (top-left origin).
   * For tests and debugging; this stalls the GPU pipeline.
   */
  samplePixels(points: { x: number; y: number }[]): [number, number, number][] {
    if (!this.drawNow()) {
      throw new Error('Not ready to draw (reference orbit pending)');
    }
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    const sx = gl.drawingBufferWidth / rect.width;
    const sy = gl.drawingBufferHeight / rect.height;
    const px = new Uint8Array(4);
    return points.map(({ x, y }) => {
      const dx = Math.floor(x * sx);
      const dy = gl.drawingBufferHeight - 1 - Math.floor(y * sy);
      gl.readPixels(dx, dy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.references.dispose();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );
    const gl = this.gl;
    // Free GPU objects, but leave the context itself alone: React StrictMode
    // remounts reuse the same canvas, and getContext would return a lost context.
    if (this.fence) gl.deleteSync(this.fence);
    gl.deleteProgram(this.direct.program);
    gl.deleteProgram(this.perturb.program);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.paletteTex);
    gl.deleteTexture(this.orbitTex);
    for (const t of [this.main, this.preview]) {
      if (t) {
        gl.deleteFramebuffer(t.framebuffer);
        gl.deleteTexture(t.texture);
      }
    }
  }
}

/**
 * Render a view at an arbitrary resolution into a PNG. Draws in tiles so a
 * heavy render doesn't trip the GPU watchdog in one enormous draw call.
 */
export async function renderToBlob(
  params: RenderParams,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new FractalRenderer(canvas, {
    autoResize: false,
    preserveDrawingBuffer: true,
  });
  try {
    renderer.setParams(params, { draw: false });
    await renderer.ready();
    const tile = 512;
    const gl = canvas.getContext('webgl2')!;
    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        renderer.drawNow({ x, y, width: tile, height: tile });
        gl.finish();
        // Yield so the page stays responsive during big exports.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Export failed'))),
        'image/png',
      ),
    );
  } finally {
    renderer.dispose();
    canvas
      .getContext('webgl2')
      ?.getExtension('WEBGL_lose_context')
      ?.loseContext();
  }
}
