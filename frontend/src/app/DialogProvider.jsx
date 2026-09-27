import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DialogContext = createContext(null);

function ConfirmDialog({ request, onDone }) {
  const { title, description, confirmLabel = 'Confirm', destructive, level = 'confirm', typedValue, requirePassword } = request;
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const canConfirm = (level !== 'typed' || typed === typedValue) && (!requirePassword || password.length > 0);

  const submit = (e) => {
    e.preventDefault();
    if (canConfirm) onDone({ ok: true, password: requirePassword ? password : undefined });
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onDone({ ok: false })}>
      <AlertDialogContent>
        <form onSubmit={submit}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {level === 'typed' && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="confirm-typed">
                Type <span className="font-mono font-semibold">{typedValue}</span> to confirm
              </Label>
              <Input id="confirm-typed" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
          )}
          {requirePassword && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="confirm-password">Managed password</Label>
              <Input id="confirm-password" type="password" autoFocus={level !== 'typed'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={!canConfirm} autoFocus={level !== 'typed' && !requirePassword}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DialogProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [error, setError] = useState(null);

  // A new request cancels one still open, so the earlier caller's promise never hangs.
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) =>
        setRequest((prev) => {
          prev?.resolve({ ok: false });
          return { ...opts, resolve };
        }),
      ),
    [],
  );
  const showError = useCallback((title, message) => setError({ title, message }), []);
  const value = useMemo(() => ({ confirm, showError }), [confirm, showError]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {request && (
        <ConfirmDialog
          key={request.title}
          request={request}
          onDone={(result) => {
            request.resolve(result);
            setRequest(null);
          }}
        />
      )}
      <Dialog open={!!error} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{error?.title}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[50vh] overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{error?.message}</pre>
        </DialogContent>
      </Dialog>
    </DialogContext.Provider>
  );
}

export function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used inside <DialogProvider>');
  return ctx;
}
