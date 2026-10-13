import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBlocker } from 'react-router';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { fetchAppConfig, updateAppConfig } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { useDialogs } from '@/app/DialogProvider';

export const textareaClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30';

export const settingsKeys = {
  config: (key) => ['app-config', key],
  notifications: ['notifications'],
  vpn: ['vpn-status'],
  projectRemote: (key) => ['project-remote', key],
};

export function SectionHeader({ title, description, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchField({ id, label, checked, onCheckedChange, hint }) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} className="mt-0.5" checked={checked} onCheckedChange={onCheckedChange} />
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function Card({ className, children }) {
  return <div className={cn('rounded-lg border bg-card p-4', className)}>{children}</div>;
}

export function EmptyNote({ children }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function LoadingList() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

export function LoadError({ what, error }) {
  return <p className="text-sm text-bad">Could not load {what}: {error.message}</p>;
}

// Side sheet holding an edit form, with Save/Cancel pinned to the bottom (thumb reach on phones).
// It stays open while a save is in flight, so the result lands on the form that sent it.
export function FormSheet({ open, onOpenChange, title, description, onSubmit, saving, saveLabel = 'Save', extraActions, error, children }) {
  return (
    <Sheet open={open} onOpenChange={(o) => (o || !saving) && onOpenChange(o)}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">{children}</div>
          <SheetFooter className="mt-0 border-t">
            {error && <p role="alert" className="text-sm whitespace-pre-wrap text-bad">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {extraActions}
              <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="h-10" disabled={saving}>{saving ? 'Saving…' : saveLabel}</Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// Loads one app-config key into an editable draft; `save` writes the draft back.
export function useConfigDraft(key, { fromServer = (d) => d, toServer = (d) => d, label } = {}) {
  const runCommand = useRunCommand();
  const q = useQuery({ queryKey: settingsKeys.config(key), queryFn: () => fetchAppConfig(key) });
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [saving, setSaving] = useState(false);

  const dirty = draft != null && JSON.stringify(draft) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useUnsavedGuard(dirty);

  // Take fresh server data, but never over the top of unsaved edits.
  useEffect(() => {
    if (q.data === undefined || dirtyRef.current) return;
    const next = fromServer(q.data);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (value = draft, { invalidate = [], success } = {}) => {
    const before = JSON.stringify(draftRef.current);
    setSaving(true);
    const r = await runCommand({
      pending: `Saving ${label}…`,
      success: success ?? `${label} saved`,
      failure: `Could not save ${label}`,
      fn: async () => (await updateAppConfig(key, toServer(value))) ?? true,
      invalidate: [settingsKeys.config(key), ...invalidate],
    });
    setSaving(false);
    if (r) {
      // Edits typed while the save was in flight stay, and still count as unsaved.
      setDraft((current) => (JSON.stringify(current) === before ? value : current));
      setBaseline(JSON.stringify(value));
    }
    return r;
  };

  return { q, draft, setDraft, dirty, save, saving };
}

// Asks before leaving the page (another section or route, or closing the tab) with unsaved edits.
export function useUnsavedGuard(dirty) {
  const { confirm: askConfirm } = useDialogs();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    askConfirm({
      title: 'Discard unsaved changes?',
      description: 'You have changes in this section that are not saved yet.',
      confirmLabel: 'Discard changes',
      destructive: true,
    }).then((res) => (res.ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, askConfirm]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
}

export function SaveBar({ dirty, saving, onSave, error }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
      {error ? <span role="alert" className="mr-auto text-xs text-bad">{error}</span> : dirty && <span className="mr-auto text-xs text-warn">Unsaved changes</span>}
      <Button className="h-10" disabled={!dirty || saving || !!error} onClick={onSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
    </div>
  );
}
