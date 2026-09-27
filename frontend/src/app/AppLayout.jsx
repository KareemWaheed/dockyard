import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { ArrowDown, Loader2, Menu } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import Sidebar from '@/app/Sidebar';
import { LayoutContext } from '@/app/layoutContext';
import { usePref } from '@/lib/storage';
import ContainerDrawer from '@/features/container/ContainerDrawer';
import { ActivityPanel } from '@/features/activity/ActivityPanel';
import { CommandPalette } from '@/features/palette/CommandPalette';
import { OfflineBanner } from '@/app/OfflineBanner';
import { PULL_THRESHOLD, usePullToRefresh } from '@/app/usePullToRefresh';

export default function AppLayout() {
  const [activityOpen, setActivityOpen] = usePref('activityOpen', false);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const qc = useQueryClient();
  const mainRef = useRef(null);
  // Refetch what's on screen; the app itself (drawers, filters, open logs) stays as it is.
  const { pull, refreshing } = usePullToRefresh(mainRef, () => qc.refetchQueries({ type: 'active' }));
  const toggleActivity = useCallback(() => setActivityOpen((o) => !o), [setActivityOpen]);
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
  const layout = useMemo(
    () => ({ activityOpen, setActivityOpen, toggleActivity, openPalette }),
    [activityOpen, setActivityOpen, toggleActivity, openPalette],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'a' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return;
      toggleActivity();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleActivity]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <LayoutContext.Provider value={layout}>
      {/* Installed on iOS, the status bar is translucent with always-white text: give it a solid
          dark strip so the text stays readable and nothing scrolls underneath it. 0px elsewhere. */}
      <div data-status-bar aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-brand" />
      <div className="flex h-dvh overflow-hidden bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:block">
          <Sidebar />
        </aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-64 bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center gap-2 border-b bg-card px-3 md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <span className="font-semibold">Dockyard</span>
          </div>
          <OfflineBanner />
          <div className="relative flex min-h-0 flex-1 flex-col">
            {(pull > 0 || refreshing) && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
                style={{ transform: `translateY(${refreshing ? 12 : pull - 28}px)` }}
              >
                <span role="status" className="flex size-9 items-center justify-center rounded-full border bg-card shadow">
                  {refreshing ? (
                    <Loader2 className="size-4 animate-spin text-primary" aria-label="Refreshing" />
                  ) : (
                    <ArrowDown
                      className="size-4 text-muted-foreground transition-transform"
                      style={{ transform: pull >= PULL_THRESHOLD ? 'rotate(180deg)' : undefined }}
                      aria-label={pull >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
                    />
                  )}
                </span>
              </div>
            )}
            <main ref={mainRef} className="min-h-0 flex-1 overflow-auto overscroll-y-contain">
              <Outlet />
            </main>
          </div>
        </div>
        {activityOpen && <ActivityPanel />}
        <ContainerDrawer />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </LayoutContext.Provider>
  );
}
