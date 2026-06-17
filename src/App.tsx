import './App.css';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { darkTheme } from './theme';
import { JuliaSet } from './julia/JuliaSet';
import { MandlebrotSet } from './mandlebrot/MandlebrotSet';

const router = createBrowserRouter([
  {
    path: '/',
    element: <div>Home</div>,
  },
  {
    path: '/julia',
    element: <JuliaSet />,
  },
  {
    path: '/mandlebrot',
    element: <MandlebrotSet />,
  },
]);

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
