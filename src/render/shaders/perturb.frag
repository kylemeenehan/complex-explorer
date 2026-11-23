#version 300 es
// Perturbation rendering for deep zoom. The maths, and the CPU version this
// is ported from, are in src/math/reference-orbit.ts and src/math/perturbation.ts.
//
// Each pixel iterates δ = z − Z against a reference orbit Z (a texture),
//   δ ← δ (2Z + δ) + δc,
// rebasing onto the reference that starts at 0 whenever |z| < |δ| or the
// reference runs out.
//
// Below about 2^-60, δ would underflow float32, so it is held as a
// float-with-exponent ("FE": vec2 mantissa with max-abs in [0.5, 1) and a
// shared int exponent). Once |δ| > 2^-50, the pixel switches to plain
// float32 arithmetic, which is much faster.
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec2 uResolution;      // device pixels
uniform float uPixelMant;      // pixel size = uPixelMant · 2^uPixelExp
uniform int uPixelExp;
uniform vec2 uRefOffsetMant;   // view centre − reference point, as FE
uniform int uRefOffsetExp;
uniform int uKind;             // 0 = Mandelbrot (δc = pixel), 1 = Julia (δz₀ = pixel)
uniform int uMaxIter;
uniform sampler2D uOrbit;      // RGBA32F: (re mantissa, im mantissa, exponent, 0)
uniform int uOrbitWidth;
uniform int uLenA;
uniform int uStartB;
uniform int uLenB;

out vec4 outColor;

#include "colour"

const int FE_ZERO_EXP = -100000;
const float LN2 = 0.6931471805599453;

struct FE {
  vec2 m;
  int e;
};

// 2^e as a float, for e in the normal float32 range (0 below it).
float exp2i(int e) {
  if (e < -126) return 0.0;
  return intBitsToFloat((min(e, 127) + 127) << 23);
}

// v · 2^e for any e (split in two so intermediate scales stay representable).
vec2 scale2(vec2 v, int e) {
  int h = e / 2;
  return v * exp2i(h) * exp2i(e - h);
}

FE feNorm(FE a) {
  float big = max(abs(a.m.x), abs(a.m.y));
  if (big == 0.0) return FE(vec2(0.0), FE_ZERO_EXP);
  int k = ((floatBitsToInt(big) >> 23) & 0xff) - 126;
  return FE(scale2(a.m, -k), a.e + k);
}

FE feAdd(FE a, FE b) {
  if (a.e < b.e) {
    FE t = a;
    a = b;
    b = t;
  }
  int d = b.e - a.e;
  if (d < -60) return a;
  return feNorm(FE(a.m + scale2(b.m, d), a.e));
}

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

FE feMul(FE a, FE b) {
  return feNorm(FE(cmul(a.m, b.m), a.e + b.e));
}

// log2|a| (a huge negative number for zero; log2(0) is undefined in GLSL).
float feLog2(FE a) {
  float l = length(a.m);
  return l == 0.0 ? -1e30 : log2(l) + float(a.e);
}

vec2 feToFloat(FE a) {
  return scale2(a.m, a.e);
}

FE refAt(int i) {
  vec4 t = texelFetch(uOrbit, ivec2(i % uOrbitWidth, i / uOrbitWidth), 0);
  return FE(t.xy, int(t.z));
}

const int FAST_ABOVE = -50;  // switch to float32 once δ's exponent exceeds this
const int SLOW_BELOW = -60;  // and back to FE if it falls below this

void main() {
  vec2 off = gl_FragCoord.xy - 0.5 * uResolution;
  FE pixel = feAdd(FE(uRefOffsetMant, uRefOffsetExp), feNorm(FE(off * uPixelMant, uPixelExp)));
  // (GLSL ES doesn't allow ?: on structs.)
  FE dc = FE(vec2(0.0), FE_ZERO_EXP);
  FE dz = dc;
  if (uKind == 0) {
    dc = pixel;
  } else {
    dz = pixel;
  }
  vec2 dcf = feToFloat(dc);

  int base = 0;
  int len = uLenA;
  int m = 0;
  FE Z = refAt(0);

  // Mandelbrot starts with δ = 0, so judge by δc which δ becomes after one step.
  bool fast = max(dz.e, dc.e) > FAST_ABOVE;
  vec2 d = feToFloat(dz);
  float r2 = uBailout * uBailout;
  float log2R = log2(uBailout);
  bool escaped = false;
  float logZ = 0.0;
  int n = 0;

  while (n < uMaxIter) {
    n++;
    if (fast) {
      vec2 Zf = scale2(Z.m, Z.e);
      d = cmul(d, 2.0 * Zf + d) + dcf;
      m++;
      Z = refAt(base + m);
      vec2 z = scale2(Z.m, Z.e) + d;
      float z2 = dot(z, z);
      if (z2 > r2) {
        escaped = true;
        logZ = 0.5 * log(z2);
        break;
      }
      if (z2 < dot(d, d) || m >= len - 1) {
        d = z;
        base = uStartB;
        len = uLenB;
        m = 0;
        Z = refAt(base);
        if (max(abs(d.x), abs(d.y)) < exp2i(SLOW_BELOW)) {
          fast = false;
          dz = feNorm(FE(d, 0));
        }
      }
    } else {
      dz = feAdd(feMul(dz, feAdd(FE(2.0 * Z.m, Z.e), dz)), dc);
      m++;
      Z = refAt(base + m);
      FE z = feAdd(Z, dz);
      float lz = feLog2(z);
      if (lz > log2R) {
        escaped = true;
        logZ = lz * LN2;
        break;
      }
      if (lz < feLog2(dz) || m >= len - 1) {
        dz = z;
        base = uStartB;
        len = uLenB;
        m = 0;
        Z = refAt(base);
      }
      if (dz.e > FAST_ABOVE) {
        fast = true;
        d = feToFloat(dz);
      }
    }
  }
  outColor = vec4(colourFor(escaped, n, logZ), 1.0);
}
