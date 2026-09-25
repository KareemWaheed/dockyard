import { useCallback, useState } from 'react';

const PREFIX = 'dockyard:';

// Per-browser conveniences only. Storage may be blocked (private mode, previews),
// so every access is guarded and the app must work with the fallback.
export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore: preference simply won't persist
  }
}

export function usePref(key, fallback) {
  const [value, setValue] = useState(() => readPref(key, fallback));
  const set = useCallback(
    (next) =>
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        writePref(key, resolved);
        return resolved;
      }),
    [key],
  );
  return [value, set];
}
