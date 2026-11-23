import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined';
import LinkIcon from '@mui/icons-material/Link';
import TuneIcon from '@mui/icons-material/Tune';
import { ControlPanel } from '../components/ControlPanel';
import type { PageKind } from '../state/app-state';
import { AppStateProvider, useAppState } from '../state/AppStateContext';
import { ExportMenu } from './ExportMenu';
import { HelpDialog } from './HelpDialog';
import { PresetsMenu } from './PresetsMenu';

const PANEL_WIDTH = 340;
const PANEL_KEY = 'complex-explorer.panel-open';

function readPanelPref(fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(PANEL_KEY);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writePanelPref(open: boolean) {
  try {
    localStorage.setItem(PANEL_KEY, open ? '1' : '0');
  } catch {
    // Storage unavailable (private mode etc.): the preference just isn't remembered.
  }
}

/** Page chrome for the explorer pages; remounts its state whenever the URL is navigated. */
export function ExplorerShell({
  page,
  children,
}: {
  page: PageKind;
  children: ReactNode;
}) {
  const location = useLocation();
  return (
    <AppStateProvider
      key={location.key}
      page={page}
      initialSearch={location.search}
    >
      <ShellLayout>{children}</ShellLayout>
    </AppStateProvider>
  );
}

function ShellLayout({ children }: { children: ReactNode }) {
  const { page, linkTo } = useAppState();
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 900px)');
  const [panelOpen, setPanelOpen] = useState(() =>
    readPanelPref(window.innerWidth >= 1280),
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const togglePanel = () => {
    setPanelOpen(!panelOpen);
    writePanelPref(!panelOpen);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) return;
      if (e.key === '?') setHelpOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const copyLink = async () => {
    const url = `${window.location.origin}${linkTo()}`;
    window.history.replaceState(window.history.state, '', linkTo());
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied. It reproduces this exact view.');
    } catch {
      setMessage('Copy the address bar to share this view.');
    }
  };

  const panel = <ControlPanel />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" elevation={2}>
        <Toolbar variant="dense" sx={{ gap: 1, minHeight: 52 }}>
          <Typography
            component={RouterLink}
            to="/"
            variant="h6"
            noWrap
            sx={{
              color: 'inherit',
              textDecoration: 'none',
              display: { xs: 'none', sm: 'block' },
              mr: 1,
            }}
          >
            Complex Explorer
          </Typography>
          <Tabs
            value={page}
            onChange={(_, v: PageKind) => navigate(linkTo(v))}
            textColor="inherit"
            indicatorColor="secondary"
            variant="scrollable"
            scrollButtons={false}
            sx={{
              minHeight: 52,
              flexShrink: 1,
              minWidth: 0,
              '& .MuiTab-root': { minHeight: 52, textTransform: 'none' },
            }}
          >
            <Tab value="mandelbrot" label="Mandelbrot" />
            <Tab value="julia" label="Julia" />
            <Tab value="explore" label="Side by side" />
          </Tabs>
          <Box sx={{ flex: 1 }} />
          <PresetsMenu />
          <Tooltip title="Copy link to this view">
            <IconButton
              color="inherit"
              aria-label="Copy link"
              onClick={copyLink}
            >
              <LinkIcon />
            </IconButton>
          </Tooltip>
          <ExportMenu onMessage={setMessage} />
          <Tooltip title="Help (?)">
            <IconButton
              color="inherit"
              aria-label="Help"
              onClick={() => setHelpOpen(true)}
            >
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Parameters">
            <IconButton
              color="inherit"
              aria-label="Parameters"
              aria-pressed={panelOpen}
              onClick={togglePanel}
              data-testid="toggle-panel"
            >
              <TuneIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box
          component="main"
          sx={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}
        >
          {children}
        </Box>
        {wide && panelOpen && (
          <Box
            component="aside"
            aria-label="Parameters"
            sx={{
              width: PANEL_WIDTH,
              flexShrink: 0,
              overflowY: 'auto',
              borderLeft: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            {panel}
          </Box>
        )}
      </Box>
      {!wide && (
        <Drawer
          anchor="right"
          open={panelOpen}
          onClose={togglePanel}
          slotProps={{
            paper: { sx: { width: `min(${PANEL_WIDTH}px, 90vw)` } },
          }}
        >
          {panel}
        </Drawer>
      )}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Snackbar
        open={!!message}
        autoHideDuration={3000}
        onClose={() => setMessage(null)}
        message={message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
