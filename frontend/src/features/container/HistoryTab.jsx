import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { fetchHistory } from '@/lib/api';
import { qk } from '@/lib/queries';
import { formatAgo } from '@/lib/containers';
import { StatusDot } from '@/components/status';
import { cn } from '@/lib/utils';

export function HistoryTab({ env, container }) {
  const [expanded, setExpanded] = useState(null);
  const q = useQuery({
    queryKey: qk.history(env, container.name, 50),
    queryFn: () => fetchHistory(env, { container: container.name, limit: 50 }),
  });
  if (q.isLoading) return <p className="text-muted-foreground">Loading history…</p>;
  if (q.isError) return <p className="text-bad">Could not load history: {q.error.message}</p>;
  if (!q.data.length) return <p className="text-muted-foreground">No recorded actions yet.</p>;

  return (
    <ul className="divide-y">
      {q.data.map((row) => {
        const failed = !row.success;
        const open = expanded === row.id;
        const Line = (
          <span className="flex w-full items-center gap-2 py-2 text-left">
            <StatusDot tone={failed ? 'bad' : 'ok'} />
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{formatAgo(row.timestamp)}</span>
            <span className="font-medium">{row.action}</span>
            {row.old_tag && row.new_tag && <span className="font-mono text-xs">{row.old_tag} → {row.new_tag}</span>}
            <span className={cn('ml-auto text-xs', failed ? 'text-bad' : 'text-muted-foreground')}>
              {failed ? 'failed' : row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : 'ok'}
            </span>
            {failed && <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden="true" />}
          </span>
        );
        return (
          <li key={row.id}>
            {failed ? (
              <button type="button" className="w-full" aria-expanded={open} onClick={() => setExpanded(open ? null : row.id)}>
                {Line}
              </button>
            ) : (
              Line
            )}
            {failed && open && (
              <pre className="mb-2 overflow-auto rounded-md bg-bad-bg p-2 font-mono text-xs whitespace-pre-wrap text-bad">{row.error_message}</pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}
