import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/app/PageHeader';
import { fetchBuildRun, fetchBuildRuns, fetchCapRoverTargets, fetchProjects } from '@/lib/api';
import { formatAgo } from '@/lib/containers';
import { qk } from '@/lib/queries';
import { readPref, writePref } from '@/lib/storage';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { RunList } from '@/features/runs/RunList';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { ComboPicker } from '@/features/runs/ComboPicker';
import { isActive, toIso } from '@/features/runs/runStatus';
import { argsToValues, deployEnvOf, tagParamOf } from '@/features/builds/buildArgs';
import { NewBuildSheet } from '@/features/builds/NewBuildSheet';
import { RunDetail } from '@/features/builds/RunDetail';

const LAST_PROJECT = 'builds.lastProject';
const MAX_TABS = 5;
const FILTERS = {
  all: () => true,
  build: (r) => r.type === 'build',
  deploy: (r) => r.type === 'deploy',
  clone: (r) => r.type === 'clone',
  failed: (r) => r.status === 'failed',
  active: (r) => isActive(r.status),
};

const useProjects = () => useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });

function Empty({ title, children }) {
  return (
    <div className="m-auto max-w-sm p-8 text-center">
      <p className="mb-1 text-[15px] font-semibold">{title}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function NoProjects() {
  return (
    <Empty title="No build projects yet">
      Add one in <Link className="text-primary underline" to="/settings">Settings</Link> → Build Projects.
    </Empty>
  );
}

export function BuildsIndex() {
  const projects = useProjects();
  if (projects.isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (projects.isError) return <Empty title="Could not load build projects">{projects.error.message}</Empty>;
  const keys = Object.keys(projects.data || {});
  if (keys.length === 0) return <NoProjects />;
  const last = readPref(LAST_PROJECT, null);
  return <Navigate replace to={`/builds/${encodeURIComponent(keys.includes(last) ? last : keys[0])}`} />;
}

function ProjectSwitcher({ projects, current }) {
  const navigate = useNavigate();
  const keys = Object.keys(projects);
  const go = (key) => navigate(`/builds/${encodeURIComponent(key)}`);
  const options = keys.map((k) => ({ value: k, label: projects[k].name || k }));
  return (
    <>
      {keys.length <= MAX_TABS ? (
        <nav aria-label="Projects" className="hidden gap-1 md:flex">
          {keys.map((k) => (
            <NavLink
              key={k}
              to={`/builds/${encodeURIComponent(k)}`}
              className={({ isActive: on }) => cn('rounded-md px-3 py-1.5 text-sm hover:bg-muted', (on || k === current) && 'bg-accent font-medium text-accent-foreground')}
            >
              {projects[k].name || k}
            </NavLink>
          ))}
        </nav>
      ) : (
        <div className="hidden w-56 md:block">
          <Label htmlFor="project-picker" className="sr-only">Project</Label>
          <ComboPicker id="project-picker" options={options} value={current} onChange={go} placeholder="Project…" searchLabel="Search projects" emptyText="No matching project." />
        </div>
      )}
      <NativeSelect aria-label="Project" className="w-40 md:hidden" value={current} onChange={(e) => go(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    </>
  );
}

function RunRow({ run, queuePos, now }) {
  const what = run.type === 'clone' ? 'clone' : run.type === 'deploy' ? `🚀 ${deployEnvOf(run) || run.branch || 'deploy'}` : run.branch || 'build';
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="font-medium tabular-nums">#{run.build_number}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{what}</span>
        <RunStatusBadge status={run.status} />
      </span>
      <span className="text-xs text-muted-foreground">{queuePos ? `Queued · position ${queuePos}` : formatAgo(toIso(run.started_at), now)}</span>
    </>
  );
}

export default function BuildsPage() {
  const { project, num } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const now = useNow(30000);
  const [filter, setFilter] = useState('all');

  const projectsQ = useProjects();
  const def = projectsQ.data?.[project];
  const targetsQ = useQuery({ queryKey: qk.caproverTargets, queryFn: fetchCapRoverTargets, staleTime: 60000 });
  const runsQ = useInfiniteQuery({
    queryKey: qk.buildRunPages(project),
    queryFn: ({ pageParam }) => fetchBuildRuns(project, { offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, p) => n + p.runs.length, 0) : undefined),
    refetchInterval: 10000,
    enabled: !!def,
  });
  const runs = runsQ.data?.pages.flatMap((p) => p.runs) ?? [];
  const shown = runs.filter(FILTERS[filter]);
  const queued = runs.filter((r) => r.status === 'queued').sort((a, b) => a.id - b.id);

  const selectedNum = num != null ? Number(num) : isDesktop ? runs[0]?.build_number : undefined;
  const listed = runs.find((r) => r.build_number === selectedNum);
  const singleQ = useQuery({
    queryKey: qk.buildRun(project, selectedNum),
    queryFn: () => fetchBuildRun(project, selectedNum),
    enabled: selectedNum != null && !listed && runsQ.isSuccess,
    retry: false,
  });
  const selected = listed ?? singleQ.data;

  useEffect(() => {
    if (def) writePref(LAST_PROJECT, project);
  }, [def, project]);

  const sheetOpen = search.get('new') === '1';
  const setSheetOpen = useCallback(
    (open) =>
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (open) next.set('new', '1');
          else {
            next.delete('new');
            next.delete('from');
          }
          return next;
        },
        { replace: true },
      ),
    [setSearch],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable) return;
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return;
      e.preventDefault();
      setSheetOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSheetOpen]);

  if (projectsQ.isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (projectsQ.isError) return <Empty title="Could not load build projects">{projectsQ.error.message}</Empty>;
  if (Object.keys(projectsQ.data || {}).length === 0) return <NoProjects />;
  if (!def) {
    return (
      <Empty title={`Unknown project “${project}”`}>
        <Link className="text-primary underline" to="/builds">Back to Builds</Link>
      </Empty>
    );
  }

  const base = `/builds/${encodeURIComponent(project)}`;
  const inDetail = num != null;
  const fromNum = search.get('from');
  const fromRun = fromNum != null ? runs.find((r) => r.type === 'build' && r.build_number === Number(fromNum)) : undefined;
  // Tags already built (loaded runs) so "Rebuild with next tag" never reuses one.
  const tagParam = tagParamOf(def.params || []);
  const knownTags = tagParam
    ? runs.filter((r) => r.type === 'build').map((r) => argsToValues(def.params, r.args_json)[tagParam.name]).filter(Boolean)
    : [];

  let detail;
  if (selected) {
    detail = <RunDetail key={selected.id} project={project} run={selected} params={def.params || []} targets={targetsQ.data || []} knownTags={knownTags} />;
  } else if (singleQ.isError) {
    detail = (
      <Empty title={`Run #${selectedNum} not found`}>
        <Link className="text-primary underline" to={base}>Back to runs</Link>
      </Empty>
    );
  } else if (runsQ.isSuccess && runs.length === 0 && !inDetail) {
    detail = <Empty title="No runs yet">Start one with <strong>New build</strong>.</Empty>;
  } else if (inDetail || runsQ.isLoading) {
    detail = <div className="space-y-3 p-5"><Skeleton className="h-6 w-64" /><Skeleton className="h-64" /></div>;
  } else {
    detail = <Empty title="Select a run">Pick a run from the list to see its log.</Empty>;
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Builds" subtitle={def.name}>
        <ProjectSwitcher projects={projectsQ.data} current={project} />
        <Button className="hidden h-9 sm:inline-flex" aria-keyshortcuts="n" onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" /> New build
        </Button>
        <Button size="icon" className="size-10 sm:hidden" aria-label="New build" onClick={() => setSheetOpen(true)}>
          <Plus className="size-5" />
        </Button>
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        <section aria-label="Run list" className={cn('min-h-0 w-full flex-col border-r lg:flex lg:w-80 lg:shrink-0', inDetail ? 'hidden' : 'flex')}>
          <div className="border-b p-3">
            <NativeSelect aria-label="Filter runs" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All runs</option>
              <option value="build">Builds</option>
              <option value="deploy">Deploys</option>
              <option value="clone">Clones</option>
              <option value="failed">Failed</option>
              <option value="active">Running or queued</option>
            </NativeSelect>
          </div>
          {runsQ.isLoading ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : runsQ.isError ? (
            <p className="p-4 text-sm text-bad">Could not load runs: {runsQ.error.message}</p>
          ) : (
            <RunList
              label="Runs"
              items={shown}
              getKey={(r) => r.id}
              getHref={(r) => `${base}/${r.build_number}`}
              isSelected={(r) => r.build_number === selectedNum}
              renderItem={(r) => {
                const pos = r.status === 'queued' ? queued.findIndex((q) => q.id === r.id) + 1 : 0;
                return <RunRow run={r} queuePos={pos} now={now} />;
              }}
              footer={
                runsQ.hasNextPage && (
                  <div className="p-3">
                    <Button variant="outline" className="h-10 w-full" disabled={runsQ.isFetchingNextPage} onClick={() => runsQ.fetchNextPage()}>
                      {runsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )
              }
            />
          )}
        </section>
        <section aria-label="Run detail" className={cn('min-h-0 min-w-0 flex-1 flex-col overflow-auto', inDetail ? 'flex' : 'hidden lg:flex')}>
          {detail}
        </section>
      </div>
      <NewBuildSheet project={project} def={def} fromRun={fromRun} open={sheetOpen} onOpenChange={setSheetOpen} onStarted={(n) => navigate(`${base}/${n}`)} />
    </div>
  );
}
