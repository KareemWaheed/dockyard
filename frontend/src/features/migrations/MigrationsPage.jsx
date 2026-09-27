import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/app/PageHeader';
import { fetchFlywayEnvs, fetchFlywayRun, fetchFlywayRuns, fetchProjects } from '@/lib/api';
import { formatAgo } from '@/lib/containers';
import { qk } from '@/lib/queries';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { RunList } from '@/features/runs/RunList';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { toIso } from '@/features/runs/runStatus';
import { MigrationForm } from '@/features/migrations/MigrationForm';
import { CommandTag, MigrationRunDetail, whereOf } from '@/features/migrations/MigrationRunDetail';

function Empty({ title, children }) {
  return (
    <div className="m-auto max-w-md p-8 text-center">
      <p className="mb-1 text-[15px] font-semibold">{title}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export default function MigrationsPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const now = useNow(30000);

  const projectsQ = useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });
  const envsQ = useQuery({ queryKey: qk.flywayEnvs, queryFn: fetchFlywayEnvs, staleTime: 60000 });
  const runsQ = useQuery({ queryKey: qk.flywayRuns, queryFn: fetchFlywayRuns, refetchInterval: 10000 });

  const flywayProjects = Object.fromEntries(Object.entries(projectsQ.data || {}).filter(([, p]) => p.isFlyway));
  const envs = envsQ.data || [];
  const runs = runsQ.data || [];
  const busy = runs.some((r) => r.status === 'running');

  const selectedId = runId != null ? Number(runId) : isDesktop ? runs[0]?.id : undefined;
  const listed = runs.find((r) => r.id === selectedId);
  const singleQ = useQuery({
    queryKey: qk.flywayRun(selectedId),
    queryFn: () => fetchFlywayRun(selectedId),
    enabled: selectedId != null && !listed && runsQ.isSuccess,
    retry: false,
  });
  const selected = listed ?? singleQ.data;
  const inDetail = runId != null;

  if (projectsQ.isLoading || envsQ.isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (Object.keys(flywayProjects).length === 0 && envs.length === 0 && runs.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Migrations" />
        <Empty title="Set up migrations">
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-left">
            <li>In <Link className="text-primary underline" to="/settings">Settings</Link> → Build Projects, turn on “Flyway project” for a project.</li>
            <li>In <Link className="text-primary underline" to="/settings">Settings</Link> → Flyway, add an environment and its databases.</li>
          </ol>
        </Empty>
      </div>
    );
  }

  let detail;
  if (selected) detail = <MigrationRunDetail key={selected.id} run={selected} />;
  else if (singleQ.isError) detail = <Empty title={`Run #${selectedId} not found`}><Link className="text-primary underline" to="/migrations">Back to history</Link></Empty>;
  else if (runsQ.isSuccess && runs.length === 0) detail = <Empty title="No migration runs yet">Run <strong>Info</strong> to see the database state.</Empty>;
  else if (inDetail || runsQ.isLoading) detail = <div className="space-y-3 p-5"><Skeleton className="h-6 w-64" /><Skeleton className="h-64" /></div>;
  else detail = <Empty title="Select a run">Pick a run to see its output.</Empty>;

  return (
    <div className="flex flex-col lg:h-full">
      <PageHeader title="Migrations" />
      <section aria-label="Run migration" className={cn('border-b bg-card p-4 lg:px-6', inDetail && 'hidden lg:block')}>
        <MigrationForm projects={flywayProjects} envs={envs} busy={busy} onStarted={(id) => navigate(`/migrations/${id}`)} />
      </section>
      <div className="flex min-h-0 flex-1">
        <section aria-label="Migration history" className={cn('w-full flex-col border-r lg:flex lg:w-[420px] lg:shrink-0', inDetail ? 'hidden' : 'flex')}>
          {runsQ.isError ? (
            <p className="p-4 text-sm text-bad">Could not load runs: {runsQ.error.message}</p>
          ) : (
            <RunList
              label="Migration runs"
              items={runs}
              getKey={(r) => r.id}
              getHref={(r) => `/migrations/${r.id}`}
              isSelected={(r) => r.id === selectedId}
              renderItem={(r) => (
                <>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">#{r.run_number}</span>
                    <CommandTag command={r.command} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{whereOf(r)}</span>
                    <RunStatusBadge status={r.status} />
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{r.project}@{r.branch}</span> · {formatAgo(toIso(r.started_at), now)}
                  </span>
                </>
              )}
            />
          )}
        </section>
        <section aria-label="Run detail" className={cn('min-w-0 flex-1 flex-col', inDetail ? 'flex' : 'hidden lg:flex')}>
          {detail}
        </section>
      </div>
    </div>
  );
}
