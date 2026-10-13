import { useSyncExternalStore } from 'react';

// Dockyard usually sits behind an SSO proxy (Cloudflare Access). When its session cookie
// expires, every /api call is answered with a redirect to the proxy's login page instead
// of data. The installed PWA boots from its service-worker cache, so the app shell still
// loads and only the API fails — reloading never reaches the login page. We detect that
// redirect here and let the app send the user through the login flow on purpose.

let expired = false;
const listeners = new Set();

export function markSessionExpired() {
  if (expired) return;
  expired = true;
  listeners.forEach((l) => l());
}

export function isSessionExpired() {
  return expired;
}

export function useSessionExpired() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => expired,
  );
}

// A proxy login redirect, seen through fetch(..., { redirect: 'manual' }): the backend itself
// never redirects /api requests, and never answers 401.
export function isAuthRedirect(response) {
  return response.type === 'opaqueredirect' || response.status === 401;
}

// /api/* bypasses the service worker's navigation fallback, so this navigation always reaches
// the network, where the proxy runs its login and the backend then sends us back here.
export function reauthUrl(loc = window.location) {
  return `/api/auth/reauth?next=${encodeURIComponent(loc.pathname + loc.search + loc.hash)}`;
}

export function reauthenticate() {
  window.location.assign(reauthUrl());
}

// For tests.
export function resetSession() {
  expired = false;
  listeners.forEach((l) => l());
}
