import { expect, test } from '@playwright/test';
import { waitForRender, watchErrors } from './helpers';

test('home page links to the three explorers', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Complex Explorer' }),
  ).toBeVisible();
  for (const name of ['The Mandelbrot set', 'Julia sets', 'Side by side']) {
    await expect(
      page.getByRole('link', { name: new RegExp(name) }),
    ).toBeVisible();
  }
  await page.getByRole('link', { name: /Side by side/ }).click();
  await waitForRender(page, 'mandelbrot');
  await waitForRender(page, 'julia');
  expect(errors).toEqual([]);
});

for (const [path, panes] of [
  ['/mandelbrot', ['mandelbrot']],
  ['/julia', ['julia']],
  ['/explore', ['mandelbrot', 'julia']],
] as const) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path);
    for (const pane of panes) await waitForRender(page, pane);
    await expect(page).toHaveURL(/[?&]c=/);
    expect(errors).toEqual([]);
  });
}

test('the old misspelt URL redirects and keeps its state', async ({ page }) => {
  await page.goto('/mandlebrot?m=-1,0.5,0.25');
  await expect(page).toHaveURL(/\/mandelbrot\?m=-1,0\.5,0\.25/);
  await waitForRender(page, 'mandelbrot');
});
