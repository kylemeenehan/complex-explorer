import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { BigFloat } from '../math/bigfloat';
import {
  centerDigits,
  makeView,
  MAX_RADIUS,
  type View,
} from '../math/viewport';
import { PALETTES, PALETTE_IDS, type PaletteId } from '../render/palettes';
import { effectiveMaxIter, MAX_ITER_LIMIT, pageKeys } from '../state/app-state';
import { useAppState } from '../state/AppStateContext';
import { CommitField } from './CommitField';

const parseBig = (s: string) => BigFloat.parse(s);
const parseRadius = (s: string) => {
  const r = BigFloat.parse(s);
  return r && r.sign() > 0 && r.toNumber() <= MAX_RADIUS ? r : null;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      <Typography
        variant="overline"
        color="text.secondary"
        component="h2"
        sx={{ lineHeight: 2 }}
      >
        {title}
      </Typography>
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  );
}

function ViewFields({
  label,
  view,
  onChange,
  onReset,
  testId,
}: {
  label: string;
  view: View;
  onChange: (v: View) => void;
  onReset: () => void;
  testId: string;
}) {
  const digits = centerDigits(view);
  return (
    <Section title={label}>
      <CommitField
        label="Centre, real part"
        value={view.re}
        format={(v) => v.toString(digits)}
        parse={parseBig}
        onCommit={(re) => onChange(makeView(re, view.im, view.r))}
        slotProps={{ htmlInput: { 'data-testid': `${testId}-re` } }}
      />
      <CommitField
        label="Centre, imaginary part"
        value={view.im}
        format={(v) => v.toString(digits)}
        parse={parseBig}
        onCommit={(im) => onChange(makeView(view.re, im, view.r))}
      />
      <CommitField
        label="Radius r (half the shorter side)"
        value={view.r}
        format={(v) => v.toString(6)}
        parse={parseRadius}
        onCommit={(r) => onChange(makeView(view.re, view.im, r))}
      />
      <Button size="small" variant="outlined" onClick={onReset}>
        Reset view
      </Button>
    </Section>
  );
}

/** Slider position ↔ iteration count, log scale from 10 to 1,000,000. */
const iterToSlider = (n: number) => Math.log10(n);
const sliderToIter = (v: number) => Math.round(10 ** v);

export function ControlPanel() {
  const { state, page, setM, setJ, setC, updateSettings, resetM, resetJ } =
    useAppState();
  const keys = pageKeys(page);
  const s = state.settings;
  const deepest =
    keys.includes('m') && (!keys.includes('j') || state.m.r.cmp(state.j.r) < 0)
      ? state.m
      : state.j;
  const cDigits = Math.max(17, centerDigits(deepest));
  const iter = effectiveMaxIter(s, deepest);

  return (
    <Box sx={{ pb: 4 }} data-testid="control-panel">
      <Section title="Parameter c">
        <Typography variant="body2" color="text.secondary">
          {page === 'mandelbrot'
            ? 'The marked point. Click the set to move it.'
            : 'The constant in f(z) = z² + c.'}
        </Typography>
        <CommitField
          label="Re c"
          value={state.c.re}
          format={(v) => v.toString(cDigits)}
          parse={parseBig}
          onCommit={(re) => setC({ re, im: state.c.im })}
          slotProps={{ htmlInput: { 'data-testid': 'c-re' } }}
        />
        <CommitField
          label="Im c"
          value={state.c.im}
          format={(v) => v.toString(cDigits)}
          parse={parseBig}
          onCommit={(im) => setC({ re: state.c.re, im })}
          slotProps={{ htmlInput: { 'data-testid': 'c-im' } }}
        />
        {page === 'explore' && (
          <FormControlLabel
            control={
              <Switch
                checked={s.follow}
                onChange={(e) => updateSettings({ follow: e.target.checked })}
              />
            }
            label="c follows the cursor over the Mandelbrot set"
          />
        )}
      </Section>
      <Divider />
      {keys.includes('m') && (
        <ViewFields
          label="Mandelbrot view"
          view={state.m}
          onChange={setM}
          onReset={resetM}
          testId="m"
        />
      )}
      {keys.includes('j') && (
        <ViewFields
          label="Julia view"
          view={state.j}
          onChange={setJ}
          onReset={resetJ}
          testId="j"
        />
      )}
      <Divider />
      <Section title="Iteration">
        <FormControlLabel
          control={
            <Switch
              checked={s.maxIter === 'auto'}
              onChange={(e) =>
                updateSettings({ maxIter: e.target.checked ? 'auto' : iter })
              }
            />
          }
          label="Choose automatically from the zoom depth"
        />
        <Box sx={{ px: 1 }}>
          <Typography variant="body2" id="iter-label">
            Maximum iterations: {iter.toLocaleString()}
          </Typography>
          <Slider
            aria-labelledby="iter-label"
            min={1}
            max={6}
            step={0.01}
            value={iterToSlider(iter)}
            scale={sliderToIter}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => v.toLocaleString()}
            onChange={(_, v) =>
              updateSettings({ maxIter: sliderToIter(v as number) })
            }
          />
        </Box>
        <CommitField
          label="Maximum iterations"
          value={iter}
          format={String}
          parse={(t) => {
            const n = Number(t);
            return Number.isInteger(n) && n >= 1 && n <= MAX_ITER_LIMIT
              ? n
              : null;
          }}
          onCommit={(n) => updateSettings({ maxIter: n })}
        />
        <CommitField
          label="Bailout radius R"
          helperText="A point has escaped once |z| > R. Any R ≥ 2 gives the same set; larger R makes smoother colouring."
          value={s.bailout}
          format={String}
          parse={(t) => {
            const n = Number(t);
            return Number.isFinite(n) && n >= 2 && n <= 1e8 ? n : null;
          }}
          onCommit={(bailout) => updateSettings({ bailout })}
        />
      </Section>
      <Divider />
      <Section title="Colouring">
        <TextField
          select
          size="small"
          label="Palette"
          value={s.palette}
          onChange={(e) =>
            updateSettings({ palette: e.target.value as PaletteId })
          }
        >
          {PALETTE_IDS.map((id) => (
            <MenuItem key={id} value={id}>
              {PALETTES[id].label}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={s.smooth}
              onChange={(e) => updateSettings({ smooth: e.target.checked })}
            />
          }
          label="Smooth (continuous) iteration count"
        />
        <Box sx={{ px: 1 }}>
          <Typography variant="body2" id="density-label">
            Colour density: {s.density.toFixed(2)} cycles per 64 iterations
          </Typography>
          <Slider
            aria-labelledby="density-label"
            min={-2}
            max={2}
            step={0.01}
            value={Math.log10(s.density)}
            scale={(v) => 10 ** v}
            onChange={(_, v) =>
              updateSettings({
                density: Number((10 ** (v as number)).toPrecision(3)),
              })
            }
          />
          <Typography variant="body2" id="offset-label">
            Colour offset: {s.offset.toFixed(2)}
          </Typography>
          <Slider
            aria-labelledby="offset-label"
            min={0}
            max={0.99}
            step={0.01}
            value={s.offset}
            onChange={(_, v) => updateSettings({ offset: v as number })}
          />
        </Box>
      </Section>
      <Divider />
      <Section title="Overlays">
        <FormControlLabel
          control={
            <Switch
              checked={s.grid}
              onChange={(e) => updateSettings({ grid: e.target.checked })}
            />
          }
          label="Axes and grid"
        />
        <FormControlLabel
          control={
            <Switch
              checked={s.orbit}
              onChange={(e) => updateSettings({ orbit: e.target.checked })}
            />
          }
          label="Orbits"
        />
      </Section>
    </Box>
  );
}
