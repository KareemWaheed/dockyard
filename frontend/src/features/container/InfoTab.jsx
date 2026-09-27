import { useQuery } from '@tanstack/react-query';
import { fetchVersionInfo } from '@/lib/api';
import { cn } from '@/lib/utils';

export function InfoTab({ env, container }) {
  const q = useQuery({
    queryKey: ['version-info', env, container.name],
    queryFn: () => fetchVersionInfo(env, container.name, { stackPath: container.stackPath, serviceName: container.serviceName || container.name }),
  });
  if (q.isLoading) return <p className="text-muted-foreground">Loading build info…</p>;
  if (q.isError) return <p className="text-bad">Could not read build info: {q.error.message}</p>;
  const entries = Object.entries(q.data?.raw || {});
  if (!entries.length) return <p className="text-muted-foreground">No build info fields found.</p>;
  const dirty = q.data.dirty === true || q.data.dirty === 'true';

  return (
    <dl className="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-3 gap-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-xs break-all text-muted-foreground">{key}</dt>
          <dd className={cn('font-mono text-xs break-all', /dirty/i.test(key) && dirty && 'text-bad')}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') || '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
