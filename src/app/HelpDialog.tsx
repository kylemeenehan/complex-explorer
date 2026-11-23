import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';

const CONTROLS: [string, string][] = [
  ['Drag (mouse, one finger)', 'Pan'],
  ['Scroll wheel, trackpad pinch, two-finger pinch', 'Zoom about the pointer'],
  ['Double-click / Shift + double-click', 'Zoom in / out ×2'],
  ['Click or tap', 'Mandelbrot: set c. Julia: show the orbit of that point'],
  ['Drag the yellow marker', 'Move c (or z₀) continuously'],
  ['Arrow keys (Shift for bigger steps)', 'Pan'],
  ['+ / −', 'Zoom in / out'],
  ['0', 'Reset the view'],
  ['?', 'This help'],
];

export function HelpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        How to use Complex Explorer
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Every picture comes from iterating f<sub>c</sub>(z) = z² + c. The{' '}
          <strong>Mandelbrot set</strong> M is the set of parameters c for which
          the orbit of the critical point 0 stays bounded. For a fixed c, the{' '}
          <strong>filled Julia set</strong> K<sub>c</sub> is the set of starting
          points z whose orbit stays bounded, and J<sub>c</sub> is its boundary.
          J<sub>c</sub> is connected exactly when c ∈ M, and is otherwise a
          Cantor set.
        </Typography>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Black points did not escape |z| &gt; R within the iteration limit.
          Every other point is coloured by how quickly its orbit escaped.
        </Typography>
        <Table size="small">
          <TableBody>
            {CONTROLS.map(([input, action]) => (
              <TableRow key={input}>
                <TableCell sx={{ whiteSpace: 'nowrap', pl: 0 }}>
                  {input}
                </TableCell>
                <TableCell>{action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          The address bar always holds the full state, to as many digits as the
          zoom needs. Use <em>Copy link</em> to share exactly what you see.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
