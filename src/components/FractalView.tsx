import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import type { BigComplex } from '../math/bigfloat';
import type { Complex } from '../math/iterate';
import {
  centerDigits,
  complexToPixel,
  magnification,
  pixelToComplex,
  type Size,
  type View,
} from '../math/viewport';
import {
  FractalRenderer,
  isDeep,
  type FractalKind,
} from '../render/FractalRenderer';
import type { ReferenceProgress } from '../render/perturbation/ReferenceComputer';
import { effectiveMaxIter, type Settings } from '../state/app-state';
import { usePanZoom } from '../interaction/usePanZoom';
import { drawOverlay, MARKER_RADIUS } from './overlay';
import { formatBigComplex } from './format';

export type FractalViewProps = {
  kind: FractalKind;
  view: View;
  onViewChange: (view: View) => void;
  c: BigComplex;
  settings: Settings;
  /** Draw the parameter c as a marker (on the Mandelbrot set). */
  marker?: BigComplex | null;
  markerLabel?: string;
  /** Dragging the marker moves it (instead of panning). */
  onMarkerDrag?: (z: BigComplex) => void;
  onTap?: (z: BigComplex) => void;
  onHover?: (z: BigComplex | null) => void;
  orbit?: Complex[] | null;
  onReset: () => void;
  /** Extra controls in the top-right corner (e.g. maximise). */
  actions?: ReactNode;
  title?: string;
  testId: string;
};

function elementSize(el: HTMLElement): Size {
  const rect = el.getBoundingClientRect();
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
}

export function FractalView(props: FractalViewProps) {
  const {
    kind,
    view,
    c,
    settings,
    marker = null,
    markerLabel = 'c',
    orbit = null,
    testId,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FractalRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  const [cursor, setCursor] = useState<BigComplex | null>(null);
  const [referenceProgress, setReferenceProgress] =
    useState<ReferenceProgress>(null);
  const [renderedIterations, setRenderedIterations] = useState<number | null>(
    null,
  );

  // Latest values for event handlers (which are attached once).
  const latest = useRef({ view, props });
  useLayoutEffect(() => {
    latest.current = { view, props };
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    try {
      rendererRef.current = new FractalRenderer(canvas, {
        onError: (e) => setError(e.message),
        onReferenceProgress: setReferenceProgress,
        onIterations: setRenderedIterations,
      });
    } catch (e) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off capability failure
      setError((e as Error).message);
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => setSize(elementSize(el)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxIter = effectiveMaxIter(settings, view);
  useEffect(() => {
    rendererRef.current?.setParams({
      kind,
      view,
      c,
      maxIter,
      autoIter: settings.maxIter === 'auto',
      bailout: settings.bailout,
      palette: settings.palette,
      density: settings.density,
      offset: settings.offset,
      smooth: settings.smooth,
      interior: [0, 0, 0],
    });
  }, [kind, view, c, maxIter, settings]);

  useEffect(() => {
    const canvas = overlayRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const frame = requestAnimationFrame(() =>
      drawOverlay(ctx, dpr, {
        view,
        size,
        grid: settings.grid,
        marker,
        markerLabel,
        orbit,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [view, size, settings.grid, marker, markerLabel, orbit]);

  const toComplex = (p: { x: number; y: number }) =>
    pixelToComplex(
      latest.current.view,
      elementSize(containerRef.current!),
      p.x,
      p.y,
    );

  const gestures = usePanZoom(containerRef, {
    getView: () => latest.current.view,
    getSize: () => elementSize(containerRef.current!),
    setView: (v) => latest.current.props.onViewChange(v),
    onReset: () => latest.current.props.onReset(),
    onTap: (p) => latest.current.props.onTap?.(toComplex(p)),
    onHover: (p) => {
      const z = p ? toComplex(p) : null;
      setCursor(z);
      latest.current.props.onHover?.(z);
    },
    hitHandle: (p) => {
      const { props: cur, view: v } = latest.current;
      if (!cur.marker || !cur.onMarkerDrag) return false;
      const m = complexToPixel(
        v,
        elementSize(containerRef.current!),
        cur.marker,
      );
      return Math.hypot(m.x - p.x, m.y - p.y) <= MARKER_RADIUS + 8;
    },
    onHandleDrag: (p) => latest.current.props.onMarkerDrag?.(toComplex(p)),
  });

  const digits = useMemo(() => Math.min(centerDigits(view), 40), [view]);
  const readout = cursor ?? { re: view.re, im: view.im };

  return (
    <Box
      ref={containerRef}
      tabIndex={0}
      data-testid={testId}
      aria-label={`${kind === 'mandelbrot' ? 'Mandelbrot' : 'Julia'} set view. Drag to pan, scroll or pinch to zoom, arrow keys and +/− also work.`}
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'crosshair',
        outline: 'none',
        bgcolor: '#000',
        '&:focus-visible': { boxShadow: 'inset 0 0 0 2px #90caf9' },
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid={`${testId}-canvas`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      <canvas
        ref={overlayRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {props.title && (
        <Typography
          variant="overline"
          sx={{
            position: 'absolute',
            top: 6,
            left: 10,
            px: 1,
            borderRadius: 1,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: '#fff',
            pointerEvents: 'none',
          }}
        >
          {props.title}
        </Typography>
      )}
      <Box
        data-gesture-ignore
        sx={{
          position: 'absolute',
          top: 6,
          right: 6,
          display: 'flex',
          gap: 0.5,
        }}
      >
        {props.actions}
      </Box>
      <Box
        data-testid={`${testId}-readout`}
        sx={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          maxWidth: 'calc(100% - 130px)',
          px: 1,
          py: 0.5,
          borderRadius: 1,
          bgcolor: 'rgba(0,0,0,0.6)',
          color: '#fff',
          font: '12px ui-monospace, Menlo, Consolas, monospace',
          pointerEvents: 'none',
          overflowWrap: 'anywhere',
        }}
      >
        <div>
          {cursor ? 'z = ' : 'centre = '}
          {formatBigComplex(readout, digits)}
        </div>
        <div style={{ opacity: 0.75 }}>
          zoom {magnification(view)} · r = {view.r.toString(3)} ·{' '}
          {(renderedIterations ?? maxIter).toLocaleString()} iterations
          {isDeep(view) && ' · perturbation'}
        </div>
      </Box>
      {referenceProgress && (
        <Box
          role="status"
          data-testid={`${testId}-reference-progress`}
          sx={{
            position: 'absolute',
            left: '50%',
            top: 8,
            transform: 'translateX(-50%)',
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            bgcolor: 'rgba(0,0,0,0.7)',
            color: '#fff',
            font: '12px ui-monospace, Menlo, Consolas, monospace',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Computing high-precision reference orbit…{' '}
          {Math.round(
            (100 * referenceProgress.iterations) / referenceProgress.maxIter,
          )}
          %
        </Box>
      )}
      <Box
        sx={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
        data-gesture-ignore
      >
        {[
          [
            'Zoom in (+)',
            <AddIcon key="i" />,
            () => gestures.current?.zoomAtCentre(0.5),
          ],
          [
            'Zoom out (−)',
            <RemoveIcon key="o" />,
            () => gestures.current?.zoomAtCentre(2),
          ],
          [
            'Reset view (0)',
            <CenterFocusStrongIcon key="r" />,
            () => props.onReset(),
          ],
        ].map(([label, icon, action]) => (
          <Tooltip
            key={label as string}
            title={label as string}
            placement="left"
          >
            <IconButton
              size="small"
              aria-label={label as string}
              onClick={action as () => void}
              sx={{
                bgcolor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
              }}
            >
              {icon as ReactNode}
            </IconButton>
          </Tooltip>
        ))}
      </Box>
      {error && (
        <Box
          role="alert"
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            p: 3,
            color: '#fff',
            textAlign: 'center',
          }}
        >
          <div>
            <strong>Unable to render.</strong>
            <br />
            {error}
          </div>
        </Box>
      )}
    </Box>
  );
}
