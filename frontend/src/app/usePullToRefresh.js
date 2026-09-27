import { useEffect, useRef, useState } from 'react';

export const PULL_THRESHOLD = 70; // px of indicator travel needed to trigger a refresh
const MAX_PULL = 120;
const RESISTANCE = 0.5; // the indicator moves half as far as the finger

// Something between the touch and the scroll container is scrolled (a log, a table): let it scroll.
function insideScrolledPanel(target, container) {
  for (let node = target; node && node !== container; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

// Touch-only pull-to-refresh for a scroll container. Installed PWAs have no native one on iOS,
// and the app scrolls inside <main>, so Android's browser gesture never fires either.
export function usePullToRefresh(ref, onRefresh) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef({ startY: null, pull: 0, refreshing: false });
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const s = state.current;

    const reset = () => {
      s.startY = null;
      s.pull = 0;
      setPull(0);
    };
    const onStart = (e) => {
      if (s.refreshing || el.scrollTop > 0 || insideScrolledPanel(e.target, el)) return;
      s.startY = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (s.startY == null) return;
      const dy = e.touches[0].clientY - s.startY;
      if (dy <= 0 || el.scrollTop > 0) {
        reset();
        return;
      }
      e.preventDefault(); // we own this gesture: no rubber-band scroll underneath the indicator
      s.pull = Math.min(dy * RESISTANCE, MAX_PULL);
      setPull(s.pull);
    };
    const onEnd = async () => {
      if (s.startY == null) return;
      const triggered = s.pull >= PULL_THRESHOLD;
      reset();
      if (!triggered) return;
      s.refreshing = true;
      setRefreshing(true);
      try {
        await refreshRef.current();
      } finally {
        s.refreshing = false;
        setRefreshing(false);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', reset);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [ref]);

  return { pull, refreshing };
}
