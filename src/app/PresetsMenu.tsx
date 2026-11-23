import { useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import PlaceIcon from '@mui/icons-material/Place';
import { pathFor, serializeState, type PageKind } from '../state/app-state';
import { useAppState } from '../state/AppStateContext';
import { PRESETS, type Preset } from '../state/presets';

/** The page a preset should open on, given where we are now. */
function targetPage(preset: Preset, current: PageKind): PageKind {
  if (current === 'explore') return 'explore';
  return preset.page;
}

export function PresetsMenu() {
  const { state, page } = useAppState();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const groups = [...new Set(PRESETS.map((p) => p.group))];

  const choose = (preset: Preset) => {
    setAnchor(null);
    const next = preset.apply(state);
    const target = targetPage(preset, page);
    navigate(`${pathFor(target)}?${serializeState(next, target)}`);
  };

  return (
    <>
      <Button
        color="inherit"
        startIcon={<PlaceIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ textTransform: 'none' }}
      >
        Places
      </Button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxWidth: 380 } } }}
      >
        {groups.flatMap((group) => [
          <ListSubheader key={group}>{group}</ListSubheader>,
          ...PRESETS.filter((p) => p.group === group).map((p) => (
            <MenuItem
              key={p.id}
              onClick={() => choose(p)}
              data-testid={`preset-${p.id}`}
            >
              <ListItemText
                primary={p.name}
                secondary={p.description}
                slotProps={{ secondary: { sx: { whiteSpace: 'normal' } } }}
              />
            </MenuItem>
          )),
        ])}
      </Menu>
    </>
  );
}
