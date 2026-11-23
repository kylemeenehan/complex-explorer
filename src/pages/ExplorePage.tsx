import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import NearMeIcon from '@mui/icons-material/NearMe';
import NearMeDisabledIcon from '@mui/icons-material/NearMeDisabled';
import { useAppState } from '../state/AppStateContext';
import { JuliaPane, MandelbrotPane } from './panes';

type Layout = 'both' | 'm' | 'j';

const paneButton = {
  bgcolor: 'rgba(0,0,0,0.6)',
  color: '#fff',
  '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
};

export function ExplorePage() {
  const { state, updateSettings } = useAppState();
  const [layout, setLayout] = useState<Layout>('both');
  const stacked = useMediaQuery('(max-aspect-ratio: 1/1)');
  const toggle = (pane: 'm' | 'j') => (
    <Tooltip title={layout === pane ? 'Show both' : 'Maximise'}>
      <IconButton
        size="small"
        sx={paneButton}
        aria-label={layout === pane ? 'Show both' : 'Maximise'}
        onClick={() => setLayout(layout === pane ? 'both' : pane)}
      >
        {layout === pane ? (
          <CloseFullscreenIcon fontSize="small" />
        ) : (
          <OpenInFullIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  );
  const follow = state.settings.follow;

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        gap: '2px',
        bgcolor: 'divider',
        minHeight: 0,
      }}
    >
      {layout !== 'j' && (
        <MandelbrotPane
          title="Parameter plane: Mandelbrot set"
          actions={
            <>
              <Tooltip
                title={
                  follow
                    ? 'c follows the cursor (on)'
                    : 'Make c follow the cursor'
                }
              >
                <IconButton
                  size="small"
                  sx={paneButton}
                  aria-pressed={follow}
                  aria-label="c follows the cursor"
                  onClick={() => updateSettings({ follow: !follow })}
                >
                  {follow ? (
                    <NearMeIcon fontSize="small" />
                  ) : (
                    <NearMeDisabledIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              {toggle('m')}
            </>
          }
        />
      )}
      {layout !== 'm' && (
        <JuliaPane title="Dynamical plane: Julia set" actions={toggle('j')} />
      )}
    </Box>
  );
}
