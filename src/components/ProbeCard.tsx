import { useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export function ProbeCard({
  title,
  children,
  testId,
  top = 8,
  defaultOpen = true,
}: {
  title: ReactNode;
  children: ReactNode;
  testId?: string;
  top?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Paper
      elevation={6}
      data-testid={testId}
      data-gesture-ignore
      sx={{
        position: 'absolute',
        top,
        left: 8,
        width: open ? 'min(340px, calc(100% - 64px))' : 'auto',
        p: 1.25,
        bgcolor: 'rgba(18,18,18,0.88)',
        backdropFilter: 'blur(4px)',
        zIndex: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="subtitle2"
          sx={{
            flex: 1,
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? (
            <ExpandLessIcon fontSize="small" />
          ) : (
            <ExpandMoreIcon fontSize="small" />
          )}
        </IconButton>
      </Box>
      {open && (
        <Box sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.45 }}>{children}</Box>
      )}
    </Paper>
  );
}
