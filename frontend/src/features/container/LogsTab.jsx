import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RunLog } from '@/features/runs/RunLog';
import { useLogStream } from '@/features/container/useLogStream';
import { useDrawerExpanded } from '@/features/container/ContainerDrawer';

export function LogsTab({ env, container }) {
  const { lines, status, reconnect } = useLogStream(env, container.name);
  const [expanded, setExpanded] = useDrawerExpanded();
  return (
    <RunLog
      className="min-h-[360px]"
      lines={lines}
      status={status}
      onReconnect={reconnect}
      emptyText="No log lines yet."
      fileName={() => `${container.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`}
      toolbarExtra={
        <Button size="icon" variant="ghost" className="size-8" aria-label={expanded ? 'Shrink drawer' : 'Expand drawer'} onClick={() => setExpanded(!expanded)}>
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      }
    />
  );
}
