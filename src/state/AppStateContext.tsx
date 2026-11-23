import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { BigComplex } from '../math/bigfloat';
import type { View } from '../math/viewport';
import {
  DEFAULT_JULIA_VIEW,
  DEFAULT_MANDELBROT_VIEW,
  parseState,
  pathFor,
  serializeState,
  type AppState,
  type PageKind,
  type Settings,
} from './app-state';

type AppStateApi = {
  state: AppState;
  page: PageKind;
  setM: (v: View) => void;
  setJ: (v: View) => void;
  setC: (c: BigComplex) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetM: () => void;
  resetJ: () => void;
  /** Path + query reproducing the current state on `page` (defaults to the current page). */
  linkTo: (page?: PageKind) => string;
};

const Ctx = createContext<AppStateApi | null>(null);

/** How long the URL waits for interaction to settle before updating. */
const URL_DEBOUNCE_MS = 200;

/**
 * Holds the explorer state. It is initialised from the URL query, and the URL
 * is kept in sync (with history.replaceState, so panning doesn't flood the
 * back button). Remount it (with a new `key`) to load a different URL.
 */
export function AppStateProvider({
  page,
  initialSearch,
  children,
}: {
  page: PageKind;
  initialSearch: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<AppState>(() => parseState(initialSearch));

  useEffect(() => {
    const t = window.setTimeout(() => {
      const url = `${pathFor(page)}?${serializeState(state, page)}`;
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, '', url);
      }
    }, URL_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [state, page]);

  const setM = useCallback((m: View) => setState((s) => ({ ...s, m })), []);
  const setJ = useCallback((j: View) => setState((s) => ({ ...s, j })), []);
  const setC = useCallback(
    (c: BigComplex) => setState((s) => ({ ...s, c })),
    [],
  );
  const updateSettings = useCallback(
    (patch: Partial<Settings>) =>
      setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    [],
  );
  const resetM = useCallback(() => setM(DEFAULT_MANDELBROT_VIEW), [setM]);
  const resetJ = useCallback(() => setJ(DEFAULT_JULIA_VIEW), [setJ]);
  const linkTo = useCallback(
    (target: PageKind = page) =>
      `${pathFor(target)}?${serializeState(state, target)}`,
    [state, page],
  );

  const api = useMemo(
    () => ({
      state,
      page,
      setM,
      setJ,
      setC,
      updateSettings,
      resetM,
      resetJ,
      linkTo,
    }),
    [state, page, setM, setJ, setC, updateSettings, resetM, resetJ, linkTo],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppState(): AppStateApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useAppState must be used inside AppStateProvider');
  return api;
}
