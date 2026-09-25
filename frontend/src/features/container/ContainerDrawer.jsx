import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { findContainer } from '@/lib/containers';
import { useEnvContainers } from '@/lib/queries';
import { usePref } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useDrawer } from '@/features/container/useDrawer';
import { DrawerHeader } from '@/features/container/DrawerHeader';
import { InfoTab } from '@/features/container/InfoTab';
import { HistoryTab } from '@/features/container/HistoryTab';
import { DeployTab } from '@/features/container/DeployTab';

const ExpandedContext = createContext([false, () => {}]);
export const useDrawerExpanded = () => useContext(ExpandedContext);

const MIN_W = 320;
const MAX_W = 800;

// Ordered tab registry. Tasks 14–16 add deploy, logs and env here.
export function drawerTabs(container, env) {
  const inStack = !!container.stackPath && !container.standalone;
  return [
    inStack && container.managed && { value: 'deploy', label: 'Deploy', render: () => <DeployTab key={`${env}/${container.name}`} env={env} container={container} /> },
    inStack && container.hasVersionInfo && { value: 'info', label: 'Build info', render: () => <InfoTab env={env} container={container} /> },
    inStack && { value: 'history', label: 'History', render: () => <HistoryTab env={env} container={container} /> },
  ].filter(Boolean);
}

function Shell({ children, label, width, expanded, onResizeStart }) {
  return (
    <aside
      aria-label={label}
      className={cn(
        // Mobile: full-screen overlay. Desktop: a flex sibling of <main>, so the table shrinks
        // instead of being covered and every column (including PROD) stays clickable.
        'fixed inset-0 z-40 flex flex-col border-l bg-card md:relative md:inset-auto md:z-auto md:h-full md:shrink-0',
        expanded ? 'md:w-[calc(100vw-14rem)]' : 'md:w-[var(--drawer-w)]',
      )}
      style={{ '--drawer-w': `${width}px` }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize drawer"
        className="absolute top-0 left-0 hidden h-full w-1.5 cursor-col-resize hover:bg-primary/30 md:block"
        onPointerDown={onResizeStart}
      />
      {children}
    </aside>
  );
}

export default function ContainerDrawer() {
  const { open, tab, setTab, closeDrawer } = useDrawer();
  const q = useEnvContainers(open?.env);
  const [width, setWidth] = usePref('drawerWidth', 440);
  const [expanded, setExpanded] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return; // a modal is handling Esc
      closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDrawer]);

  useEffect(() => setExpanded(false), [open?.env, open?.container]);

  if (!open) return null;

  const onResizeStart = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const move = (ev) => dragging.current && setWidth(Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - ev.clientX)));
    const up = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const container = findContainer(q.data, open.container);
  // While the first load is in flight the shell can't carry its real accessible
  // name yet (no container to name it after) — keep it generic so consumers that
  // find the drawer by `${container} on ${env}` wait for the loaded state instead
  // of matching the transient loading shell.
  const label = q.isLoading ? 'Loading container' : `${open.container} on ${open.env}`;
  const shellProps = { label, width, expanded, onResizeStart };

  const tabs = container ? drawerTabs(container, open.env) : [];
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value;

  return (
    <ExpandedContext.Provider value={[expanded, setExpanded]}>
      <Shell {...shellProps}>
        {!container ? (
          <>
            <div className="flex items-center justify-between border-b p-4">
              <p className="font-medium">{q.isLoading ? 'Loading…' : q.data ? `Container not found in ${open.env}` : `Can't load ${open.env}`}</p>
              <Button size="icon" variant="ghost" aria-label="Close" onClick={closeDrawer}><X className="size-4" /></Button>
            </div>
            {!q.isLoading && q.error && <p className="p-4 font-mono text-xs text-bad">{q.error.message}</p>}
          </>
        ) : (
          <>
            <DrawerHeader key={`${open.env}/${container.name}`} env={open.env} container={container} onClose={closeDrawer} />
            {tabs.length > 0 && (
              <Tabs value={active} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mx-4 mt-3 self-start">
                  {tabs.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((t) => (
                  <TabsContent key={t.value} value={t.value} className="min-h-0 flex-1 overflow-auto px-4 py-3">
                    {t.value === active && t.render()}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </>
        )}
      </Shell>
    </ExpandedContext.Provider>
  );
}
