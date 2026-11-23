// Shared colouring. Expects `#version 300 es` and precision declarations above.
//
// Iteration-count convention (matches src/math/iterate.ts): `n` is the number
// of applications of z ↦ z² + c performed when |z| first exceeded the bailout
// radius R. The smooth (continuous) count is
//   ν = n + 1 − log₂(ln|z| / ln R),
// which lies in [n, n+1] and removes the banding of the integer count.

uniform sampler2D uPalette;  // cyclic gradient, see src/render/palettes.ts
uniform float uDensity;      // palette cycles per 64 iterations
uniform float uOffset;       // palette phase in [0, 1)
uniform float uBailout;      // R
uniform bool uSmooth;
uniform vec3 uInterior;      // colour for points that never escaped

vec3 colourFor(bool escaped, int n, float mag2) {
  if (!escaped) return uInterior;
  float nu = float(n);
  if (uSmooth) {
    float logZ = 0.5 * log(mag2);
    nu += 1.0 - log2(logZ / log(uBailout));
  }
  float t = fract(uOffset + uDensity * nu / 64.0);
  return texture(uPalette, vec2(t, 0.5)).rgb;
}
