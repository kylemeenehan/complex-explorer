import type { BigComplex } from '../../math/bigfloat';
import type { OrbitTarget, ReferenceOrbit } from '../../math/reference-orbit';
import type { OrbitRequestMessage } from './orbit.worker';

const wire = (z: BigComplex) => ({
  re: { m: z.re.m, e: z.re.e },
  im: { m: z.im.m, e: z.im.e },
});

export type ReferenceProgress = { iterations: number; maxIter: number } | null;

/**
 * Runs reference-orbit computations in a Web Worker, one at a time. A new
 * request supersedes an in-flight one: the worker is terminated, because a
 * synchronous BigInt loop can't be interrupted any other way.
 */
export class ReferenceComputer {
  private worker: Worker | null = null;
  private nextId = 1;
  private inFlight: { id: number; target: OrbitTarget } | null = null;
  private readonly onResult: (orbit: ReferenceOrbit) => void;
  private readonly onProgress: (p: ReferenceProgress) => void;

  constructor(
    onResult: (orbit: ReferenceOrbit) => void,
    onProgress: (p: ReferenceProgress) => void,
  ) {
    this.onResult = onResult;
    this.onProgress = onProgress;
  }

  get pending(): OrbitTarget | null {
    return this.inFlight?.target ?? null;
  }

  request(target: OrbitTarget) {
    this.terminate();
    const worker = new Worker(new URL('./orbit.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;
    const id = this.nextId++;
    this.inFlight = { id, target };
    worker.onmessage = (e) => {
      if (this.inFlight?.id !== e.data.id) return;
      if ('progress' in e.data) {
        this.onProgress({
          iterations: e.data.progress,
          maxIter: target.maxIter,
        });
        return;
      }
      this.inFlight = null;
      this.onProgress(null);
      this.onResult({
        ...target,
        data: e.data.data,
        lenA: e.data.lenA,
        startB: e.data.startB,
        lenB: e.data.lenB,
        suggestedMaxIter: e.data.suggestedMaxIter,
      });
    };
    worker.onerror = (e) => {
      console.error('Reference orbit worker failed', e.message);
      this.inFlight = null;
      this.onProgress(null);
    };
    const message: OrbitRequestMessage = {
      id,
      target: { ...target, ref: wire(target.ref), c: wire(target.c) },
    };
    worker.postMessage(message);
    this.onProgress({ iterations: 0, maxIter: target.maxIter });
  }

  private terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = null;
  }

  dispose() {
    this.terminate();
  }
}
