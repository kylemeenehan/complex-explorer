/**
 * Computes reference orbits off the main thread. BigFloats arrive as plain
 * {m, e} objects (structured clone drops the class) and are revived here.
 */
import { BigFloat, type BigComplex } from '../../math/bigfloat';
import {
  computeReferenceOrbit,
  type OrbitTarget,
} from '../../math/reference-orbit';
import { suggestMaxIter } from '../../math/perturbation';

type Wire = { m: bigint; e: number };
type WireComplex = { re: Wire; im: Wire };
export type OrbitRequestMessage = {
  id: number;
  target: Omit<OrbitTarget, 'ref' | 'c'> & { ref: WireComplex; c: WireComplex };
};

const revive = (z: WireComplex): BigComplex => ({
  re: new BigFloat(z.re.m, z.re.e),
  im: new BigFloat(z.im.m, z.im.e),
});

self.onmessage = (e: MessageEvent<OrbitRequestMessage>) => {
  const { id, target } = e.data;
  const started = performance.now();
  const orbit = computeReferenceOrbit(
    { ...target, ref: revive(target.ref), c: revive(target.c) },
    (iterations) => self.postMessage({ id, progress: iterations }),
  );
  const suggestedMaxIter =
    target.sampleRadius !== undefined
      ? suggestMaxIter(orbit, target.sampleRadius)
      : null;
  const { data, lenA, startB, lenB } = orbit;
  self.postMessage(
    {
      id,
      data,
      lenA,
      startB,
      lenB,
      suggestedMaxIter,
      ms: performance.now() - started,
    },
    { transfer: [data.buffer] },
  );
};
