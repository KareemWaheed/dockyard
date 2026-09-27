import { DESKTOP_QUERY } from '@/lib/useMediaQuery';

// jsdom has no layout: stub matchMedia so the lg breakpoint is under test control.
export function setViewport({ desktop }) {
  window.matchMedia = (query) => ({
    matches: query === DESKTOP_QUERY ? desktop : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}
