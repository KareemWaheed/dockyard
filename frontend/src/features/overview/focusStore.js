import { useSyncExternalStore } from 'react';

// The Overview cell the user last focused, so the ⌘K palette can offer "Deploy {service} to {env}…".
let focused = null;
const listeners = new Set();

export function setFocusedCell(cell) {
  focused = cell;
  listeners.forEach((l) => l());
}

export function getFocusedCell() {
  return focused;
}

export function useFocusedCell() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getFocusedCell,
  );
}
