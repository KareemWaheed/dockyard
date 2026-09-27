import { createContext, useContext } from 'react';

export const LayoutContext = createContext(null);

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside <AppLayout>');
  return ctx;
}
