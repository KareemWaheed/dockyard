import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, ChevronDown, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cancelBuildRun, replayBuildRun, startBuild } from '@/lib/api';
import { qk } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { RunLog } from '@/features/runs/RunLog';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { isActive, toIso } from '@/features/runs/runStatus';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { useRunStream } from '@/features/runs/useRunStream';
import { argsToValues, buildArgs, nextTag, parseArgs, parseDeployMeta, parseJsonArray, tagParamOf } from '@/features/builds/buildArgs';
import { DeployBar } from '@/features/builds/DeployBar';

const formatStarted = (s) => (s ? new Date(toIso(s)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function Rows({ rows }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(({ label, value }) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-mono text-[12.5px] break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RunDetail({ project, run, params, targets, knownTags = [] }) {
  const navigate = useNavigate();
  const runCommand = useRunCommand();
  const stream = useRunStream('build', run.id, { project, active: isActive(run.status) });
  const [showDetails, setShowDetails] = useState(false);

  const status = stream.finalStatus ?? run.status;
  const merged = { ...run, ...stream.meta, status };
  const n = run.build_number;
  const base = `/builds/${encodeURIComponent(project)}`;
  const commits = parseJsonArray(merged.commits_json);
  const images = parseJsonArray(merged.pushed_images_json);
  const deployMeta = parseDeployMeta(merged);
  const paramRows = run.type === 'build' ? parseArgs(params, merged.args_json, merged.branch) : [];
  const tabs = [
    deployMeta.length > 0 && { value: 'deployment', label: 'Deployment', body: <Rows rows={deployMeta} /> },
    paramRows.length > 0 && { value: 'params', label: 'Params', body: <Rows rows={paramRows} /> },
    commits.length > 0 && {
      value: 'commits',
      label: `Commits (${commits.length})`,
      body: (
        <ul className="space-y-1 text-sm">
          {commits.map((c) => (
            <li key={c.hash} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[12.5px] text-muted-foreground">{c.shortHash}</span>
              <span className="min-w-0 flex-1">{c.subject}</span>
              <span className="text-xs text-muted-foreground">{c.date}</span>
            </li>
          ))}
        </ul>
      ),
    },
    images.length > 0 && {
      value: 'images',
      label: `Images (${images.length})`,
      body: <ul className="space-y-1 font-mono text-[12.5px] break-all">{images.map((im) => <li key={im}>{im}</li>)}</ul>,
    },
  ].filter(Boolean);

  const cancel = () =>
    runCommand({
      confirm: { title: `Stop build #${n}?`, description: 'The running process is stopped. It cannot be resumed.', confirmLabel: 'Stop build', destructive: true },
      pending: `Stopping #${n}…`,
      success: `#${n} cancelled`,
      failure: `Could not stop #${n}`,
      fn: () => cancelBuildRun(project, n),
      invalidate: [qk.buildRuns(project)],
    });

  const rebuild = async () => {
    const r = await runCommand({
      pending: `Starting a rebuild of #${n}…`,
      success: (res) => `Build #${res.buildNumber} ${res.queued ? 'queued' : 'started'}`,
      failure: `Could not rebuild #${n}`,
      fn: () => replayBuildRun(project, n),
      invalidate: [qk.buildRuns(project)],
    });
    if (r) navigate(`${base}/${r.buildNumber}`);
  };

  const tagParam = run.type === 'build' ? tagParamOf(params) : null;
  const values = tagParam ? argsToValues(params, merged.args_json) : null;
  const bumped = tagParam && values[tagParam.name] ? nextTag(values[tagParam.name], knownTags) : '';

  const rebuildNextTag = async () => {
    const r = await runCommand({
      pending: `Starting a build of ${bumped}…`,
      success: (res) => `Build #${res.buildNumber} ${res.queued ? 'queued' : 'started'} as ${bumped}`,
      failure: `Could not build ${bumped}`,
      fn: () => startBuild(project, merged.branch, buildArgs(params, { ...values, [tagParam.name]: bumped })),
      invalidate: [qk.buildRuns(project)],
    });
    if (r) navigate(`${base}/${r.buildNumber}`);
  };

  const title = run.type === 'clone' ? 'clone' : run.type === 'deploy' ? `deploy · ${merged.branch || ''}` : merged.branch || 'build';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:p-5">
      <Link to={base} className="inline-flex h-10 items-center gap-1 self-start text-sm text-muted-foreground lg:hidden">
        <ArrowLeft className="size-4" aria-hidden="true" /> Runs
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 text-[15px] font-semibold">
          #{n} <span className="font-mono text-[13px] font-normal break-all">{title}</span>
        </h2>
        <RunStatusBadge status={status} />
        <span className="text-xs text-muted-foreground">{formatStarted(run.started_at)}</span>
        <div className="ml-auto flex gap-2">
          {isActive(status) && (
            <Button variant="outline" className="h-10 text-bad" onClick={cancel}><Square className="size-4" /> Cancel run</Button>
          )}
          {run.type === 'build' && !isActive(status) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10"><RotateCcw className="size-4" /> Rebuild <ChevronDown className="size-4 opacity-60" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={rebuild}>Same parameters</DropdownMenuItem>
                {bumped && <DropdownMenuItem onSelect={rebuildNextTag}>Next tag: {bumped}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => navigate({ search: `?new=1&from=${n}` })}>Change parameters…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <DeployBar key={run.id} project={project} run={merged} status={status} targets={targets} onDeployed={(num) => navigate(`${base}/${num}`)} />

      {tabs.length > 0 && (
        <>
          <Button variant="ghost" className="h-10 justify-between lg:hidden" aria-expanded={showDetails} onClick={() => setShowDetails((s) => !s)}>
            Details <ChevronDown className={cn('size-4 transition-transform', showDetails && 'rotate-180')} />
          </Button>
          <Tabs defaultValue={tabs[0].value} className={cn(showDetails ? 'block' : 'hidden lg:block')}>
            <TabsList className="max-w-full overflow-x-auto overflow-y-hidden">
              {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
            {tabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="max-h-48 overflow-auto rounded-md border p-3">{t.body}</TabsContent>
            ))}
          </Tabs>
        </>
      )}

      {stream.stuck && (
        <div role="status" className="flex items-center gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
          <AlertTriangle className="size-4" aria-hidden="true" /> No output detected — this build may be stuck.
        </div>
      )}

      <RunLog
        className="min-h-[60vh] lg:min-h-0"
        lines={stream.lines}
        status={stream.status}
        onReconnect={stream.reconnect}
        emptyText="No output yet."
        closedText="Log stream ended before the run finished."
        fileName={() => `${project}-${n}.log`}
      />
    </div>
  );
}
