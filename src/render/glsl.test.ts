import { describe, expect, it } from 'vitest';
import { resolveIncludes } from './glsl';

describe('resolveIncludes', () => {
  it('inlines chunks once and rejects unknown ones', () => {
    const chunks = { a: 'A\n#include "b"', b: 'B' };
    expect(resolveIncludes('x\n#include "a"\n#include "b"\ny', chunks)).toBe(
      'x\nA\nB\n\ny',
    );
    expect(() => resolveIncludes('#include "nope"', chunks)).toThrow(/nope/);
  });
});
