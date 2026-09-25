import { useParams } from 'react-router';
import { PageHeader } from '@/app/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status';
import { flattenEnv, formatAgo } from '@/lib/containers';
import { useEnvContainers, useServers } from '@/lib/queries';
import { useNow } from '@/lib/useNow';
import { useDrawer } from '@/features/container/useDrawer';
import { EnvFixActions } from '@/features/overview/EnvFixActions';
import { StackTable } from '@/features/env/StackTable';

export default function EnvPage() {
  const { env } = useParams();
  const q = useEnvContainers(env);
  const { data: servers } = useServers();
  const { open, openDrawer } = useDrawer();
  const now = useNow(5000);
  const host = servers?.find((s) => s.env_key === env)?.host;
  const activeName = open?.env === env ? open.container : null;
  const onOpen = (name) => openDrawer(env, name, 'deploy');

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

  return (
    <>
      <PageHeader title={env} subtitle={subtitle}>
        {badge}
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
        {q.data?.stacks?.map((stack) => (
          <StackTable
            key={stack.path}
            env={env}
            title={stack.name}
            subtitle={`${stack.containers.length} containers`}
            containers={stack.containers}
            activeName={activeName}
            onOpen={onOpen}
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
    </>
  );
}
