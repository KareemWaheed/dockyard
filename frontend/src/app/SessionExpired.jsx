import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DockyardLogo } from '@/components/DockyardLogo';
import { reauthenticate, useSessionExpired } from '@/lib/session';

// Shown over everything once the SSO proxy (Cloudflare Access) stops letting API calls
// through. One tap runs the proxy's login and comes back to the same page — no hard reload
// or clearing site data needed, which an installed PWA can't do anyway.
export function SessionExpired() {
  const expired = useSessionExpired();
  if (!expired) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-desc"
        className="w-full max-w-sm rounded-lg border bg-card p-6 text-center shadow-lg"
      >
        <DockyardLogo className="mx-auto mb-3 size-10" />
        <h2 id="session-expired-title" className="mb-1 text-[15px] font-semibold">Your sign-in has expired</h2>
        <p id="session-expired-desc" className="mb-5 text-sm text-muted-foreground">
          Dockyard couldn't reach the server because your access session ended. Sign in again to pick up where you left off.
        </p>
        <Button className="h-10 w-full" autoFocus onClick={reauthenticate}>
          <LogIn className="size-4" /> Sign in again
        </Button>
      </div>
    </div>
  );
}
