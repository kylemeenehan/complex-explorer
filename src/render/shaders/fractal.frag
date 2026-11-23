#version 300 es
// Direct escape-time rendering in float32, used while the view is shallow
// enough for float32 coordinates to resolve individual pixels.
precision highp float;
precision highp int;

uniform vec2 uResolution;  // canvas size in device pixels
uniform vec2 uCenter;      // view centre (float32 approximation)
uniform float uPixelSize;  // complex units per device pixel
uniform int uKind;         // 0 = Mandelbrot (z₀ = 0, c = pixel), 1 = Julia (z₀ = pixel, c = uC)
uniform vec2 uC;
uniform int uMaxIter;

out vec4 outColor;

#include "colour"

// Points inside the main cardioid or the period-2 bulb never escape; skipping
// them makes overview renders at high iteration counts much faster.
bool inMainComponents(vec2 c) {
  float x = c.x - 0.25;
  float q = x * x + c.y * c.y;
  if (q * (q + x) <= 0.25 * c.y * c.y) return true;
  float x1 = c.x + 1.0;
  return x1 * x1 + c.y * c.y <= 0.0625;
}

void main() {
  vec2 p = uCenter + (gl_FragCoord.xy - 0.5 * uResolution) * uPixelSize;
  vec2 z = uKind == 0 ? vec2(0.0) : p;
  vec2 c = uKind == 0 ? p : uC;
  if (uKind == 0 && inMainComponents(c)) {
    outColor = vec4(uInterior, 1.0);
    return;
  }
  float r2 = uBailout * uBailout;
  bool escaped = false;
  int n = 0;
  float mag2 = 0.0;
  while (n < uMaxIter) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    n++;
    mag2 = dot(z, z);
    if (mag2 > r2) {
      escaped = true;
      break;
    }
  }
  outColor = vec4(colourFor(escaped, n, mag2), 1.0);
}
