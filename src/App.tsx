import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { darkTheme } from './theme';
import { ExplorerShell } from './app/ExplorerShell';
import { HomePage } from './pages/HomePage';
import { MandelbrotPage } from './pages/MandelbrotPage';
import { JuliaPage } from './pages/JuliaPage';
import { ExplorePage } from './pages/ExplorePage';

/** Old misspelt URLs keep working. */
function LegacyMandelbrotRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/mandelbrot${search}`} replace />;
}

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  {
    path: '/mandelbrot',
    element: (
      <ExplorerShell page="mandelbrot">
        <MandelbrotPage />
      </ExplorerShell>
    ),
  },
  {
    path: '/julia',
    element: (
      <ExplorerShell page="julia">
        <JuliaPage />
      </ExplorerShell>
    ),
  },
  {
    path: '/explore',
    element: (
      <ExplorerShell page="explore">
        <ExplorePage />
      </ExplorerShell>
    ),
  },
  { path: '/mandlebrot', element: <LegacyMandelbrotRedirect /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
