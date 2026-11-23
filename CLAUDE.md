# Complex Explorer

An interactive explorer for the Mandelbrot set, Julia sets, and the relationship between them. It is aimed at maths students and lecturers. Everything renders on the GPU (WebGL2). Views can be set precisely, zoomed very deep, and shared as links.

Stack: React 19, TypeScript, Vite 8, MUI 9, react-router 7, Vitest, Playwright. Deployed on Netlify as an SPA (`netlify.toml`).

## Language

Write **British English** in UI text, docs, comments and commit messages: "maths", "colour", "centre", "behaviour", "normalise". Identifiers that must match an API keep the API's spelling (CSS `color`, MUI props).

## Commands

| Command                      | What it does                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                   | Dev server (Vite)                                                                                                                                         |
| `pnpm test`                  | Unit tests (Vitest, `src/**/*.test.ts`)                                                                                                                   |
| `pnpm test:e2e`              | Browser tests (Playwright, `e2e/`); starts Vite on port 5199 itself                                                                                       |
| `pnpm typecheck`             | `tsc -b`                                                                                                                                                  |
| `pnpm lint` / `pnpm format`  | ESLint / Prettier                                                                                                                                         |
| `pnpm check`                 | lint + typecheck + unit + e2e. **Run this before calling work done.**                                                                                     |
| `pnpm shot <path> <out.png>` | Render an app URL to a PNG with headless Chromium, e.g. `pnpm shot "/mandelbrot?m=-0.745,0.113,0.006" shots/x.png --size 1200x800 [--element mandelbrot]` |

- **Look at rendering changes, don't just test them.** After changing shaders, colouring, overlays or layout, run `pnpm shot` and view the PNG. `shots/` is gitignored.
- **Agent sandbox:** Vite, Playwright and `pnpm shot` need to bind a local port. In the Claude Code sandbox, run them with the sandbox disabled, or set `sandbox.network.allowLocalBinding: true`.
- **pnpm version:** `node_modules` was installed with pnpm 11. If `pnpm` on PATH is older and complains about the store, use the pnpm 11 binary for `add`/`install`.
- Node 24 runs `.ts` scripts directly (`node scripts/shot.ts`), so no tsx or ts-node is needed.

## Architecture

```
src/math/        Pure maths, no DOM. Heavily unit-tested.
  bigfloat.ts      Arbitrary-precision binary floats (BigInt mantissa + exponent)
  viewport.ts      Pixel ↔ complex-plane mapping, pan, zoom-about-a-point
  iterate.ts       CPU escape time, orbits, period detection (ground truth for shaders)
  reference-orbit.ts  Arbitrary-precision reference orbits for perturbation (fixed-point BigInt)
  perturbation.ts  CPU mirror of the perturbation shader + iteration-count suggestion
src/render/      WebGL2
  FractalRenderer.ts  Owns a context; chooses direct vs perturbation; progressive tiled rendering
  perturbation/       Web Worker + ReferenceComputer that compute reference orbits off-thread
  shaders/            GLSL ES 3.00; `#include "name"` chunks resolved by glsl.ts
  palettes.ts         Gradient → 256-texel palette texture
src/interaction/ gestures.ts (pure GestureController, unit-tested) + usePanZoom.ts (DOM wiring)
src/state/       app-state.ts (state shape, URL encode/decode, defaults), AppStateContext.tsx, presets.ts
src/components/  FractalView (canvas + 2D overlay + readout), ControlPanel, ProbeCard, overlay.ts
src/pages/       Home, Mandelbrot, Julia, Explore (side by side); panes.tsx holds the two panes
src/app/         ExplorerShell (app bar, tabs, parameter panel), menus, help dialog
e2e/             Playwright specs; helpers.ts has URL/pixel helpers
scripts/shot.ts  Screenshot tool
```

### Maths and rendering conventions

These are load-bearing. Breaking them makes dragging feel "off" again.

- **A view is `{ re, im, r }`.** `r` is the distance from the centre to the edge of the **shorter** canvas side. Pixel size is `2r / min(width, height)`. The shaders use exactly the same formula, in device pixels.
- **Screen y points down and the complex plane is y-up.** All pixel↔complex conversion goes through `src/math/viewport.ts`. Don't re-derive it inline.
- **Never hold view state in a JS `number`.** Centres, radii and c are `BigFloat`. A float64 loses position below about 1e-15 and underflows below 1e-308. Convert with `toNumber()` only at the edge (shader uniforms, overlays at shallow zoom), and use `ratio()` / `toFloatExp()` when the values might be tiny.
- **Gestures use absolute anchoring.** A drag computes the view from the view and pointer position at gesture start, never by accumulating deltas. Zooming keeps the point under the cursor or pinch midpoint fixed. Floating controls over a view need `data-gesture-ignore`, because the native listeners run before React's `stopPropagation`.
- **Iteration count convention:** `n` is the number of applications of z ↦ z² + c when |z| first exceeds the bailout R. The smooth count is `ν = n + 1 − log₂(ln|z| / ln R)`. `iterate.ts` and `shaders/colour.glsl` must agree.
- **Rendering is batched.** `FractalRenderer.setParams()` schedules one draw per animation frame. Don't create GL objects per frame. The canvas carries `data-render-state="pending|done"` for tests.
- In dev builds the canvas exposes `canvas.__fractal.samplePixels([{x, y}])`. The e2e tests use it to read rendered colours.

### Deep zoom (perturbation)

- Views with r < 2e-4 use `shaders/perturb.frag`. A reference orbit at the view centre is computed at arbitrary precision in a worker and uploaded as an RGBA32F texture.
  - Each pixel iterates δ = z − Z with float32. Below 2⁻⁶⁰ it switches to float-with-exponent ("FE"), so depth is unlimited.
  - Zhuoran rebasing replaces glitch detection. For Julia sets, orbit A starts at the view centre and orbit B at the critical point 0.
- **`src/math/perturbation.ts` is the specification.** Change the algorithm there first, keep its tests (against brute-force BigFloat iteration) green, then port to GLSL. `e2e/deep.spec.ts` compares GPU pixels with the CPU mirror.
- A reference is reused while panning, offset by `uRefOffset`. A new one is requested in the background when the centre moves more than 768 px, or when zooming needs more precision. `referenceUsable` and `plan()` in `FractalRenderer.ts` decide.
- With `it=auto`, deep views also sample a 12×12 grid of pixel escape times on the CPU, then raise the iteration limit to resolve them (`suggestMaxIter`). Depth alone is a poor guide: Seahorse Valley at 1e-25 needs ~20,000 iterations.
- float32 deltas drift by tens of iterations over ~10,000 iterations in chaotic filaments. That is a precision limit, not a bug. Emulate float32 on the CPU (`Math.fround`) before chasing a GPU/CPU mismatch.
- Rendering is progressive:
  - Tiles go into an offscreen framebuffer, after a quarter-resolution preview when a frame can't finish in one go.
  - A GPU fence adapts the number of tiles per frame.
  - `data-render-state="done"` is set only once the final fence signals.
- Headless tests run WebGL on SwiftShader (the CPU), so deep renders are slow there. Keep deep e2e viewports small (`test.use({ viewport })`).

### State and URLs

The whole state (views, c, settings) lives in the URL query (`src/state/app-state.ts` documents the format). It is synced with `history.replaceState` after a 200 ms debounce. Decimal strings carry as many digits as the zoom needs. Parsing must tolerate missing or junk values by falling back per key, because shared links should never break. When adding a setting:

1. Add it to `Settings` and `DEFAULT_SETTINGS`.
2. Add it to `parseState` and `serializeState`.
3. Add a round-trip test.

## Testing expectations

- Pure logic (maths, viewport, gestures, URL state) gets Vitest unit tests next to the code.
- User-visible interaction gets a Playwright test. The established patterns:
  - Assert on the URL with `urlParam`, which waits for the debounce to settle.
  - Assert geometry in pixels with `expectWithinPixels`.
  - Compare rendered colours with `samplePixels` + `fractionMatching`.
- Chromium rounds synthetic mouse coordinates to whole pixels, so aim tests at integer positions.
- Touch and pinch tests live in `e2e/touch.spec.ts` (Pixel 7 project) and use CDP `Input.dispatchTouchEvent`.
