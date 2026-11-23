/**
 * The Mandelbrot and Julia panes with their teaching overlays. Used on their
 * own pages and side by side in the linked explorer.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { BigComplex } from '../math/bigfloat';
import { computeOrbit, type Complex } from '../math/iterate';
import { FractalView } from '../components/FractalView';
import { ProbeCard } from '../components/ProbeCard';
import { describeOrbit, formatBigComplex } from '../components/format';
import { effectiveMaxIter } from '../state/app-state';
import { useAppState } from '../state/AppStateContext';

/** Orbits are for looking at; more points than this is just clutter. */
const ORBIT_POINTS = 100;
/**
 * Membership tests get their own budget, independent of the (possibly low)
 * render iteration count, so the probe's verdict is trustworthy.
 */
const probeIterations = (renderIter: number) =>
  Math.min(Math.max(renderIter, 10_000), 200_000);

const toComplex = (z: BigComplex): Complex => ({
  re: z.re.toNumber(),
  im: z.im.toNumber(),
});

type PaneProps = {
  actions?: ReactNode;
  title?: string;
};

export function MandelbrotPane({ actions, title }: PaneProps) {
  const { state, page, setM, setC, resetM, linkTo } = useAppState();
  const { settings, c } = state;
  const maxIter = probeIterations(effectiveMaxIter(settings, state.m));
  const orbit = useMemo(
    () => computeOrbit({ re: 0, im: 0 }, toComplex(c), maxIter, ORBIT_POINTS),
    [c, maxIter],
  );
  const inSet = orbit.escapedAt === null;
  const follow = page === 'explore' && settings.follow;

  return (
    <Box
      sx={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <FractalView
        testId="mandelbrot"
        kind="mandelbrot"
        title={title}
        view={state.m}
        onViewChange={setM}
        c={c}
        settings={settings}
        marker={c}
        onMarkerDrag={setC}
        onTap={setC}
        onHover={follow ? (z) => z && setC(z) : undefined}
        orbit={settings.orbit ? orbit.points : null}
        onReset={resetM}
        actions={actions}
      />
      {
        <ProbeCard
          testId="mandelbrot-probe"
          top={title ? 40 : 8}
          defaultOpen={!title}
          title={<>c = {formatBigComplex(c, 12)}</>}
        >
          <div data-testid="mandelbrot-probe-status">
            {describeOrbit(orbit, maxIter, '0 under z ↦ z² + c')}{' '}
            <strong>
              {inSet
                ? orbit.period !== null
                  ? 'So c is in the Mandelbrot set.'
                  : 'So c is (very probably) in the Mandelbrot set.'
                : 'So c is not in the Mandelbrot set.'}
            </strong>
          </div>
          {page === 'mandelbrot' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="contained"
                component={RouterLink}
                to={linkTo('julia')}
              >
                Julia set for this c
              </Button>
              <Button
                size="small"
                variant="outlined"
                component={RouterLink}
                to={linkTo('explore')}
              >
                Side by side
              </Button>
            </Box>
          )}
        </ProbeCard>
      }
    </Box>
  );
}

export function JuliaPane({ actions, title }: PaneProps) {
  const { state, page, setJ, resetJ, linkTo } = useAppState();
  const { settings, c } = state;
  const [probe, setProbe] = useState<BigComplex | null>(null);
  const maxIter = probeIterations(effectiveMaxIter(settings, state.j));
  const cNum = toComplex(c);
  const critical = useMemo(
    () => computeOrbit({ re: 0, im: 0 }, cNum, maxIter, ORBIT_POINTS),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cNum is derived from c
    [c, maxIter],
  );
  const probeOrbit = useMemo(
    () =>
      probe
        ? computeOrbit(toComplex(probe), cNum, maxIter, ORBIT_POINTS)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cNum is derived from c
    [probe, c, maxIter],
  );
  const connected = critical.escapedAt === null;
  const shown = probeOrbit ?? critical;

  return (
    <Box
      sx={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <FractalView
        testId="julia"
        kind="julia"
        title={title}
        view={state.j}
        onViewChange={setJ}
        c={c}
        settings={settings}
        marker={probe}
        markerLabel="z₀"
        onMarkerDrag={setProbe}
        onTap={setProbe}
        orbit={settings.orbit ? shown.points : null}
        onReset={resetJ}
        actions={actions}
      />
      {
        <ProbeCard
          testId="julia-probe"
          top={title ? 40 : 8}
          defaultOpen={!title}
          title={
            <>
              J<sub>c</sub>, c = {formatBigComplex(c, 12)}
            </>
          }
        >
          <div>
            {connected ? (
              <>
                The critical point 0 has a bounded orbit, so c ∈ M and{' '}
                <strong>
                  J<sub>c</sub> is connected
                </strong>
                .
              </>
            ) : (
              <>
                The critical point 0 escapes, so c ∉ M and{' '}
                <strong>
                  J<sub>c</sub> is a Cantor set
                </strong>{' '}
                (totally disconnected).
              </>
            )}
          </div>
          <div style={{ marginTop: 6 }}>
            {probe ? (
              <>
                z₀ = {formatBigComplex(probe, 10)}.{' '}
                {describeOrbit(shown, maxIter, 'z₀')}{' '}
                <Button size="small" onClick={() => setProbe(null)}>
                  Clear
                </Button>
              </>
            ) : (
              'Click a point to see its orbit. The orbit drawn is that of the critical point 0.'
            )}
          </div>
          {page === 'julia' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                component={RouterLink}
                to={linkTo('explore')}
              >
                Side by side with the Mandelbrot set
              </Button>
            </Box>
          )}
        </ProbeCard>
      }
    </Box>
  );
}
