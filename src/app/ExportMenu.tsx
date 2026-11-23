import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import DownloadIcon from '@mui/icons-material/Download';
import { renderToBlob, type FractalKind } from '../render/FractalRenderer';
import { effectiveMaxIter, pageKeys } from '../state/app-state';
import { useAppState } from '../state/AppStateContext';

const SIZES: [string, number, number][] = [
  ['1920 × 1080', 1920, 1080],
  ['3840 × 2160 (4K)', 3840, 2160],
  ['2048 × 2048 square', 2048, 2048],
];

export function ExportMenu({
  onMessage,
}: {
  onMessage: (msg: string) => void;
}) {
  const { state, page } = useAppState();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const keys = pageKeys(page);
  const kinds: FractalKind[] = [
    ...(keys.includes('m') ? (['mandelbrot'] as const) : []),
    ...(keys.includes('j') ? (['julia'] as const) : []),
  ];

  const exportImage = async (
    kind: FractalKind,
    width: number,
    height: number,
  ) => {
    setAnchor(null);
    setBusy(true);
    const view = kind === 'mandelbrot' ? state.m : state.j;
    const s = state.settings;
    try {
      const blob = await renderToBlob(
        {
          kind,
          view,
          c: state.c,
          maxIter: effectiveMaxIter(s, view),
          bailout: s.bailout,
          palette: s.palette,
          density: s.density,
          offset: s.offset,
          smooth: s.smooth,
          interior: [0, 0, 0],
        },
        width,
        height,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}-${width}x${height}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onMessage('Image saved');
    } catch (e) {
      onMessage(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip title="Download image">
        <span>
          <IconButton
            color="inherit"
            aria-label="Download image"
            disabled={busy}
            onClick={(e) => setAnchor(e.currentTarget)}
          >
            <DownloadIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {kinds.flatMap((kind) => [
          <ListSubheader key={kind}>
            {kind === 'mandelbrot' ? 'Mandelbrot set' : 'Julia set'} PNG
          </ListSubheader>,
          ...SIZES.map(([label, w, h]) => (
            <MenuItem
              key={`${kind}-${label}`}
              onClick={() => exportImage(kind, w, h)}
            >
              {label}
            </MenuItem>
          )),
        ])}
      </Menu>
    </>
  );
}
