import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

// Mounted only from main.jsx so tests never import the virtual module.
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Installed PWAs can stay open for days — check for a new deploy hourly.
    onRegisteredSW: (_url, registration) => registration && setInterval(() => registration.update(), HOUR),
    onRegisterError: (err) => console.warn('Service worker registration failed', err),
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast('A new version of Dockyard is available', {
      id: 'pwa-update',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => updateServiceWorker(true) },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
