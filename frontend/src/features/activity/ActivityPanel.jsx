import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/status';
import { fetchHistory } from '@/lib/api';
import { formatAgo } from '@/lib/containers';
import { qk } from '@/lib/queries';
import { useLayout } from '@/app/layoutContext';
import { useDrawer } from '@/features/container/useDrawer';
import { useBuildActivity } from '@/features/activity/useBuildActivity';

const toIso = (s) => (s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s);

export function ActivityPanel() {
  const { setActivityOpen } = useLayout();
  const { openDrawer } = useDrawer();
  const { active } = useBuildActivity({ fast: true });
  const history = useQuery({
    queryKey: qk.history(null, null, 20),
    queryFn: () => fetchHistory(undefined, { limit: 20 }),
    refetchInterval: 30000,
  });

  return (
    <aside aria-label="Activity" className="fixed inset-0 z-30 flex flex-col border-l bg-card md:static md:w-80 md:shrink-0">
      <div className="flex items-center border-b px-4 py-3">
        <h2 className="text-[15px] font-semibold">Activity</h2>
        <Button size="icon" variant="ghost" className="ml-auto size-7" aria-label="Close activity" onClick={() => setActivityOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Running builds</h3>
          {active.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing running.</p>
          ) : (
            <ul className="space-y-1.5">
              {active.map((r) => (
                <li key={`${r.project}-${r.id}`}>
                  <Link to="/builds" className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                    {r.status === 'running' ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <StatusDot tone="warn" />}
                    <span>{r.project} #{r.build_number}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.branch}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{r.status === 'queued' ? 'queued' : formatAgo(toIso(r.started_at))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recent activity</h3>
          {history.isError && <p className="text-xs text-bad">Could not load history.</p>}
          <ul className="space-y-0.5">
            {(history.data || []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted"
                  onClick={() => openDrawer(row.env, row.container_name, 'history')}
                >
                  <StatusDot tone={row.success ? 'ok' : 'bad'} />
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">{formatAgo(row.timestamp)}</span>
                  <span className="truncate">
                    {row.container_name} <span className="text-xs text-muted-foreground">{row.env}</span>
                  </span>
                  <span className="ml-auto truncate font-mono text-xs">
                    {row.old_tag && row.new_tag ? `${row.old_tag} → ${row.new_tag}` : row.action}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
