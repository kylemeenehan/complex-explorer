import './App.css';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <div>Home</div>,
  },
  {
    path: '/julia',
    element: <div>Julia set</div>,
  },
  {
    path: '/mandelbrot',
    element: <div>Mandlebrot</div>,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
