import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status';
import { flattenEnv, formatAgo } from '@/lib/containers';
import { isServerEnabled, useEnvContainers, useServers } from '@/lib/queries';
import { useNow } from '@/lib/useNow';
import { useDrawer } from '@/features/container/useDrawer';
import { EnvFixActions } from '@/features/overview/EnvFixActions';
import { StackTable } from '@/features/env/StackTable';
import { EnvHeaderActions } from '@/features/env/EnvHeaderActions';
import { AddServiceDialog } from '@/features/env/AddServiceDialog';
import { BulkBar } from '@/features/env/BulkBar';
import { useSetServerEnabled } from '@/features/settings/useSetServerEnabled';

export default function EnvPage() {
  const { env } = useParams();
  const { data: servers } = useServers();
  const server = servers?.find((s) => s.env_key === env);
  const disabled = !!server && !isServerEnabled(server);
  // Wait for the server list so a disabled env is never contacted, even once.
  const q = useEnvContainers(servers && !disabled ? env : null);
  const { open, openDrawer } = useDrawer();
  const now = useNow(5000);
  const host = server?.host;
  const activeName = open?.env === env ? open.container : null;
  const onOpen = (name) => openDrawer(env, name, 'deploy');
  const [selected, setSelected] = useState(() => new Set());
  const [addTo, setAddTo] = useState(null); // stack index
  useEffect(() => setSelected(new Set()), [env]);
  const toggleSelect = (name) => setSelected((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const selectedContainers = flattenEnv(q.data).filter((c) => c.managed && !c.standalone && selected.has(c.name));

  const compose = flattenEnv(q.data).filter((c) => !c.standalone);
  const running = compose.filter((c) => c.status === 'running').length;
  const subtitle = [host, q.data && `${running} running · ${compose.length - running} stopped`, q.dataUpdatedAt && `refreshed ${formatAgo(new Date(q.dataUpdatedAt).toISOString(), now)}`]
    .filter(Boolean)
    .join(' · ');
  const badge = q.isError ? (
    <StatusBadge tone="bad">unreachable</StatusBadge>
  ) : q.data ? (
    <StatusBadge tone="ok">connected</StatusBadge>
  ) : (
    <StatusBadge tone="idle">connecting</StatusBadge>
  );

  if (disabled) return <DisabledEnv server={server} />;

  return (
    <>
      <PageHeader title={env} subtitle={subtitle}>
        {badge}
        <EnvHeaderActions env={env} />
      </PageHeader>
      <div className="space-y-4 p-6">
        {q.isError && (
          <div className="space-y-3 rounded-xl border border-bad/30 bg-bad-bg p-4">
            <p className="font-medium text-bad">Can't reach {env}{q.data ? '. Showing the last known state.' : ''}</p>
            <p className="font-mono text-xs break-words">{q.error?.message}</p>
            <EnvFixActions env={env} />
          </div>
        )}
        {q.isLoading && (
          <div className="space-y-2 rounded-xl border bg-card p-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        )}
        {q.data?.stacks?.map((stack, idx) => (
          <StackTable
            key={stack.path}
            env={env}
            title={stack.name}
            subtitle={`${stack.containers.length} containers`}
            containers={stack.containers}
            activeName={activeName}
            onOpen={onOpen}
            selectable
            selected={selected}
            onToggleSelect={toggleSelect}
            headerRight={
              <Button size="sm" variant="ghost" aria-label={`Add service to ${stack.name}`} onClick={() => setAddTo(idx)}>
                <Plus className="size-3.5" /> Add service
              </Button>
            }
          />
        ))}
        {q.data?.standalone?.length > 0 && (
          <StackTable
            env={env}
            title="Standalone containers"
            subtitle={`${q.data.standalone.length} containers`}
            containers={q.data.standalone}
            activeName={activeName}
            onOpen={onOpen}
          />
        )}
      </div>
      {selectedContainers.length > 0 && <BulkBar env={env} containers={selectedContainers} onClear={() => setSelected(new Set())} />}
      {addTo !== null && q.data?.stacks?.[addTo] && (
        <AddServiceDialog
          env={env}
          stackIdx={addTo}
          stackName={q.data.stacks[addTo].name}
          existing={q.data.stacks[addTo].containers}
          open
          onOpenChange={(o) => !o && setAddTo(null)}
        />
      )}
    </>
  );
}

function DisabledEnv({ server }) {
  const setEnabled = useSetServerEnabled();
  return (
    <>
      <PageHeader title={server.env_key} subtitle={server.host}>
        <StatusBadge tone="idle">disabled</StatusBadge>
      </PageHeader>
      <div className="p-6">
        <div className="mx-auto max-w-md space-y-3 rounded-xl border bg-card p-6 text-center">
          <p className="text-[15px] font-semibold">{server.env_key} is disabled</p>
          <p className="text-muted-foreground">Dockyard keeps its settings but won't connect to it or show it anywhere else.</p>
          <Button aria-label={`Enable ${server.env_key}`} onClick={() => setEnabled(server, true)}>Enable</Button>
        </div>
      </div>
    </>
  );
}
