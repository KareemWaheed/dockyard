import { Link } from 'react-router';
import { ArrowLeft, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/status';
import { cancelFlywayRun } from '@/lib/api';
import { qk } from '@/lib/queries';
import { RunLog } from '@/features/runs/RunLog';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { toIso } from '@/features/runs/runStatus';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { useRunStream } from '@/features/runs/useRunStream';

export const whereOf = (run) => `${run.env_name ?? `env #${run.env_id}`} / ${run.db_name ?? `db #${run.db_id}`}`;

export function MigrationRunDetail({ run }) {
  const runCommand = useRunCommand();
  const stream = useRunStream('flyway', run.id, { active: run.status === 'running' });
  const status = stream.finalStatus ?? run.status;

  const cancel = () =>
    runCommand({
      confirm: { title: `Stop migration run #${run.run_number}?`, description: `Stops ${run.command} on ${whereOf(run)}. A partially applied migration may need manual cleanup.`, confirmLabel: 'Stop migration', destructive: true },
      pending: `Stopping #${run.run_number}…`,
      success: `#${run.run_number} cancelled`,
      failure: `Could not stop #${run.run_number}`,
      fn: () => cancelFlywayRun(run.id),
      invalidate: [qk.flywayRuns],
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:p-5">
      <Link to="/migrations" className="inline-flex h-10 items-center gap-1 self-start text-sm text-muted-foreground lg:hidden">
        <ArrowLeft className="size-4" aria-hidden="true" /> History
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold">#{run.run_number} · {run.command} · {whereOf(run)}</h2>
        <RunStatusBadge status={status} />
        <span className="font-mono text-xs text-muted-foreground">{run.project}@{run.branch}</span>
        <span className="text-xs text-muted-foreground">{run.started_at ? new Date(toIso(run.started_at)).toLocaleString() : ''}</span>
        {status === 'running' && (
          <Button variant="outline" className="ml-auto h-10 text-bad" onClick={cancel}><Square className="size-4" /> Cancel run</Button>
        )}
      </div>
      <RunLog
        className="min-h-[60vh] lg:min-h-0"
        lines={stream.lines}
        status={stream.status}
        onReconnect={stream.reconnect}
        emptyText="No output yet."
        closedText="Log stream ended before the run finished."
        fileName={() => `flyway-${run.run_number}-${run.command}.log`}
      />
    </div>
  );
}

export function CommandTag({ command }) {
  return <Tag tone={command === 'migrate' ? 'warn' : undefined}>{command}</Tag>;
}
