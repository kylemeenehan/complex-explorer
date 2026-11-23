/**
 * Owns one WebGL2 context and draws Mandelbrot/Julia sets into it.
 *
 * - Shaders, buffers and textures are created once, not per frame.
 * - `setParams` only records the latest parameters; drawing happens at most
 *   once per animation frame, so a burst of pointer events costs one render.
 * - The canvas backing store tracks its CSS size × devicePixelRatio through a
 *   ResizeObserver.
 * - The canvas gets `data-render-state="pending" | "done"` so tests and the
 *   screenshot script can wait for a finished frame.
 */
import type { BigComplex } from '../math/bigfloat';
import { pixelSize, type View } from '../math/viewport';
import { resolveIncludes } from './glsl';
import { buildPalette, PALETTE_SIZE, type PaletteId } from './palettes';
import vertexSource from './shaders/fullscreen.vert?raw';
import fractalSource from './shaders/fractal.frag?raw';
import colourChunk from './shaders/colour.glsl?raw';

export type FractalKind = 'mandelbrot' | 'julia';

export type RenderParams = {
  kind: FractalKind;
  view: View;
  /** Julia parameter (ignored for the Mandelbrot set). */
  c: BigComplex;
  maxIter: number;
  bailout: number;
  palette: PaletteId;
  density: number;
  offset: number;
  smooth: boolean;
  interior: [number, number, number];
};

const CHUNKS = { colour: colourChunk };

const UNIFORMS = [
  'uResolution',
  'uCenter',
  'uPixelSize',
  'uKind',
  'uC',
  'uMaxIter',
  'uPalette',
  'uDensity',
  'uOffset',
  'uBailout',
  'uSmooth',
  'uInterior',
] as const;
type UniformName = (typeof UNIFORMS)[number];

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

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
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
  return program;
}

export type RendererOptions = {
  /** Track the canvas's CSS size (default true). Off for offscreen export. */
  autoResize?: boolean;
  preserveDrawingBuffer?: boolean;
  onError?: (error: Error) => void;
};

export class FractalRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private uniforms!: Record<UniformName, WebGLUniformLocation | null>;
  private vao!: WebGLVertexArrayObject;
  private buffer!: WebGLBuffer;
  private paletteTex!: WebGLTexture;
  private loadedPalette: PaletteId | null = null;
  private params: RenderParams | null = null;
  private frame = 0;
  private resizeObserver?: ResizeObserver;
  private disposed = false;
  private readonly onError: (error: Error) => void;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.onError = options.onError ?? ((e) => console.error(e));
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.init();
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
    this.program = link(gl, vertexSource, fractalSource);
    this.uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(this.program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;

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
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  };

  private handleContextRestored = () => {
    try {
      this.init();
      this.requestDraw();
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
    this.requestDraw();
  }

  setParams(params: RenderParams, { draw = true } = {}) {
    this.params = params;
    if (draw) this.requestDraw();
  }

  requestDraw() {
    if (this.disposed || this.frame) return;
    this.canvas.dataset.renderState = 'pending';
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.drawNow();
    });
  }

  /** Draw immediately (normally you want `setParams`, which batches per frame). */
  drawNow(scissor?: { x: number; y: number; width: number; height: number }) {
    const { gl, params } = this;
    if (!params || this.disposed || gl.isContextLost()) return;
    try {
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      gl.viewport(0, 0, width, height);
      if (scissor) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
      } else {
        gl.disable(gl.SCISSOR_TEST);
      }
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);

      if (this.loadedPalette !== params.palette) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          PALETTE_SIZE,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          buildPalette(params.palette),
        );
        this.loadedPalette = params.palette;
      }

      const u = this.uniforms;
      // Same mapping as src/math/viewport.ts, in device pixels.
      const ps = pixelSize(params.view, { width, height }).toNumber();
      gl.uniform2f(u.uResolution, width, height);
      gl.uniform2f(
        u.uCenter,
        params.view.re.toNumber(),
        params.view.im.toNumber(),
      );
      gl.uniform1f(u.uPixelSize, ps);
      gl.uniform1i(u.uKind, params.kind === 'mandelbrot' ? 0 : 1);
      gl.uniform2f(u.uC, params.c.re.toNumber(), params.c.im.toNumber());
      gl.uniform1i(u.uMaxIter, params.maxIter);
      gl.uniform1i(u.uPalette, 0);
      gl.uniform1f(u.uDensity, params.density);
      gl.uniform1f(u.uOffset, params.offset);
      gl.uniform1f(u.uBailout, params.bailout);
      gl.uniform1i(u.uSmooth, params.smooth ? 1 : 0);
      gl.uniform3f(u.uInterior, ...params.interior);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.canvas.dataset.renderState = 'done';
    } catch (err) {
      this.onError(err as Error);
    }
  }

  /**
   * Render now and read back RGB at CSS-pixel positions (top-left origin).
   * For tests and debugging; this stalls the GPU pipeline.
   */
  samplePixels(points: { x: number; y: number }[]): [number, number, number][] {
    this.drawNow();
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
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );
    const gl = this.gl;
    // Free GPU objects, but leave the context itself alone: React StrictMode
    // remounts reuse the same canvas, and getContext would return a lost context.
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.paletteTex);
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
