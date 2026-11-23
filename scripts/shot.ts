/**
 * Render an app URL to a PNG, for checking rendering changes by eye.
 *
 *   pnpm shot "/mandelbrot?m=-0.75,0.1,0.01" out.png [--size 1200x800] [--dpr 1] [--element mandelbrot]
 *
 * Uses a running dev server at BASE_URL (default http://localhost:5199) or
 * starts one. Waits until every fractal canvas reports
 * data-render-state="done". `--element <testId>` captures one pane only.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) flags.set(args[i].slice(2), args[++i]);
  else positional.push(args[i]);
}
const [path = '/mandelbrot', out = 'shots/shot.png'] = positional;
const [width, height] = (flags.get('size') ?? '1200x800')
  .split('x')
  .map(Number);
const dpr = Number(flags.get('dpr') ?? 1);
const element = flags.get('element');
let base = process.env.BASE_URL ?? 'http://localhost:5199';

async function isUp(url: string) {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

let server: Awaited<ReturnType<typeof createServer>> | null = null;
if (!(await isUp(base))) {
  server = await createServer({
    server: { port: 5199, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  base = server.resolvedUrls!.local[0].replace(/\/$/, '');
}

const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path);
  try {
    await page.waitForSelector('canvas[data-render-state]', {
      timeout: 15_000,
    });
  } catch (e) {
    console.error('page errors:\n' + errors.join('\n'));
    throw e;
  }
  const alert = page.getByRole('alert');
  if (await alert.count())
    throw new Error(`App reported: ${await alert.first().innerText()}`);
  await page.waitForFunction(
    () => {
      if (document.querySelector('[role="alert"]')) return true;
      const canvases = [
        ...document.querySelectorAll('canvas[data-render-state]'),
      ];
      return (
        canvases.length > 0 &&
        canvases.every(
          (c) => (c as HTMLCanvasElement).dataset.renderState === 'done',
        )
      );
    },
    null,
    { timeout: 120_000 },
  );
  if (await alert.count())
    throw new Error(`App reported: ${await alert.first().innerText()}`);
  await page.waitForTimeout(300);
  const target = element ? page.getByTestId(element) : page;
  await target.screenshot({ path: out, timeout: 300_000 });
  console.log(`wrote ${out} (${page.url()})`);
  if (errors.length) console.error('page errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  await server?.close();
}
