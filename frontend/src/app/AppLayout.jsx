import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import Sidebar from '@/app/Sidebar';
import { LayoutContext } from '@/app/layoutContext';
import { usePref } from '@/lib/storage';
import ContainerDrawer from '@/features/container/ContainerDrawer';
import { ActivityPanel } from '@/features/activity/ActivityPanel';

export default function AppLayout() {
  const [activityOpen, setActivityOpen] = usePref('activityOpen', false);
  const [navOpen, setNavOpen] = useState(false);
  const toggleActivity = useCallback(() => setActivityOpen((o) => !o), [setActivityOpen]);
  const layout = useMemo(() => ({ activityOpen, setActivityOpen, toggleActivity }), [activityOpen, setActivityOpen, toggleActivity]);

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

  return (
    <LayoutContext.Provider value={layout}>
      <div className="flex h-dvh overflow-hidden bg-background">
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
          <main className="min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
        {activityOpen && <ActivityPanel />}
        <ContainerDrawer />
      </div>
    </LayoutContext.Provider>
  );
}
