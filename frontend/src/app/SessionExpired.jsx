import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DockyardLogo } from '@/components/DockyardLogo';
import { reauthenticate, useSessionExpired } from '@/lib/session';

// Shown over everything once the SSO proxy (Cloudflare Access) stops letting API calls
// through. One tap runs the proxy's login and comes back to the same page — no hard reload
// or clearing site data needed, which an installed PWA can't do anyway.
// A real modal (focus trapped, background inert) that can't be dismissed: nothing behind it works.
export function SessionExpired() {
  const expired = useSessionExpired();
  return (
    <AlertDialog open={expired}>
      <AlertDialogContent className="text-center sm:max-w-sm" onEscapeKeyDown={(e) => e.preventDefault()}>
        <DockyardLogo className="mx-auto size-10" />
        <div className="space-y-1">
          <AlertDialogTitle className="text-[15px] font-semibold">Your sign-in has expired</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Dockyard couldn't reach the server because your access session ended. Sign in again to pick up where you left off.
          </AlertDialogDescription>
        </div>
        <Button className="h-10 w-full" autoFocus onClick={reauthenticate}>
          <LogIn className="size-4" /> Sign in again
        </Button>
      </AlertDialogContent>
    </AlertDialog>
  );
}
