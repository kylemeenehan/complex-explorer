# Complex Explorer

Explore the Mandelbrot set, Julia sets, and how they are related, in the browser.

- **Mandelbrot set**: click any point c to plot the orbit of 0 under z ↦ z² + c, with a plain-language verdict: escapes, converges to an attracting cycle of period p, or stays bounded.
- **Julia sets**: the filled Julia set for any c, with the critical orbit and the orbit of any point you click.
- **Side by side**: the parameter plane and the dynamical plane together. Drag c across the Mandelbrot set, or let it follow the cursor, and watch J<sub>c</sub> change.
- **Navigation**: drag, scroll or pinch, with zoom about the pointer. Also works with the keyboard and on touch screens.
- **Precise control**: type in the centre, radius, c, iteration limit, bailout radius and colouring.
- **Sharing**: the address bar always encodes the exact view, so a copied link reproduces it. Images export as PNG at up to 4K.
- **Places**: curated locations, including Seahorse Valley, the Feigenbaum point, the Douady rabbit, a Siegel disk and Cantor dust.

All rendering runs on the GPU with WebGL2.

## Development

Requires Node 24 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm exec playwright install chromium   # once, for browser tests
pnpm dev                                 # http://localhost:5173
pnpm check                               # lint, typecheck, unit and browser tests
pnpm shot "/explore?c=-0.12,0.75" shots/rabbit.png   # render a URL to PNG
```

`CLAUDE.md` describes the architecture, conventions and testing approach. It is written for AI coding agents, but is a good map for humans too.

## Credits

The escape-time algorithms started from the source of [complex-analysis.com](https://complex-analysis.com/).

## Licence

MIT
