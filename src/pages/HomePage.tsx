import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { renderToBlob, type RenderParams } from '../render/FractalRenderer';
import { DEFAULT_STATE, effectiveMaxIter } from '../state/app-state';
import { makeView } from '../math/viewport';

function Thumbnail({ params, alt }: { params: RenderParams; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    renderToBlob(params, 480, 270)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        // No WebGL2: the cards still work without a picture.
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [params]);
  return (
    <Box sx={{ aspectRatio: '16 / 9', bgcolor: '#000' }}>
      {src && (
        <img
          src={src}
          alt={alt}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      )}
    </Box>
  );
}

const s = DEFAULT_STATE.settings;
const base = {
  c: DEFAULT_STATE.c,
  bailout: s.bailout,
  palette: s.palette,
  density: s.density,
  offset: s.offset,
  smooth: s.smooth,
  interior: [0, 0, 0] as [number, number, number],
};
const M_THUMB: RenderParams = {
  ...base,
  kind: 'mandelbrot',
  view: DEFAULT_STATE.m,
  maxIter: 300,
};
const J_THUMB: RenderParams = {
  ...base,
  kind: 'julia',
  view: DEFAULT_STATE.j,
  maxIter: 300,
};
const SEAHORSE = makeView('-0.7453', '0.1127', '0.0065');
const E_THUMB: RenderParams = {
  ...base,
  kind: 'mandelbrot',
  view: SEAHORSE,
  maxIter: effectiveMaxIter(s, SEAHORSE),
  palette: 'ultra',
};

const CARDS = [
  {
    to: '/mandelbrot',
    title: 'The Mandelbrot set',
    body: 'The parameters c for which the orbit of 0 under z ↦ z² + c stays bounded. Click anywhere to follow that orbit and test membership.',
    params: M_THUMB,
  },
  {
    to: '/julia',
    title: 'Julia sets',
    body: 'Fix c and colour each starting point z by how fast its orbit escapes. Change c to watch the set change shape, or break up into dust.',
    params: J_THUMB,
  },
  {
    to: '/explore',
    title: 'Side by side',
    body: 'The parameter plane and the dynamical plane together. Drag c across the Mandelbrot set and watch the Julia set follow.',
    params: E_THUMB,
  },
];

export function HomePage() {
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        <Typography
          variant="h3"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 500 }}
        >
          Complex Explorer
        </Typography>
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          sx={{ mb: 4, maxWidth: 760 }}
        >
          Explore the Mandelbrot set, Julia sets, and how they relate. Every
          view can be zoomed almost without limit, set precisely by hand, and
          shared as a link.
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          }}
        >
          {CARDS.map((card) => (
            <Card key={card.to} variant="outlined">
              <CardActionArea
                component={RouterLink}
                to={card.to}
                sx={{ height: '100%' }}
              >
                <Thumbnail params={card.params} alt={card.title} />
                <CardContent>
                  <Typography variant="h6" component="h2" gutterBottom>
                    {card.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {card.body}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
