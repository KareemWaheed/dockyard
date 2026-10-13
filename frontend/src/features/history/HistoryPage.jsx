import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, Tag } from '@/components/status';
import { PageHeader } from '@/app/PageHeader';
import { fetchHistory } from '@/lib/api';
import { formatAgo } from '@/lib/containers';
import { qk, useEnvKeys } from '@/lib/queries';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/app/ThemeProvider';
import { cn } from '@/lib/utils';
import { useDrawer } from '@/features/container/useDrawer';

const PAGE = 100;

const duration = (ms) => (ms != null ? `${(ms / 1000).toFixed(1)}s` : '—');

export function matchesHistory(row, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [row.container_name, row.action, row.old_tag, row.new_tag].some((v) => v && String(v).toLowerCase().includes(needle));
}

function Result({ row }) {
  return row.success ? <StatusBadge tone="ok">ok</StatusBadge> : <StatusBadge tone="bad">failed</StatusBadge>;
}

function TagChange({ row }) {
  if (!row.old_tag || !row.new_tag) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Tag>{row.old_tag}</Tag>
      <span aria-label="to">→</span>
      <Tag>{row.new_tag}</Tag>
    </span>
  );
}

export default function HistoryPage() {
  const envKeys = useEnvKeys();
  const now = useNow(30000);
  const { openDrawer } = useDrawer();
  const { density } = useTheme();
  const rowHeight = density === 'compact' ? 'h-[30px]' : 'h-9';
  const [env, setEnv] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState(null);

  const q = useQuery({
    queryKey: qk.history(env || undefined, undefined, limit),
    queryFn: () => fetchHistory(env || undefined, { limit }),
    placeholderData: keepPreviousData,
  });
  const all = q.data || [];
  const rows = all.filter((r) => matchesHistory(r, query.trim()));
  const hasMore = all.length >= limit;

  const changeEnv = (value) => {
    setEnv(value);
    setLimit(PAGE);
    setExpanded(null);
  };
  const toggle = (row) => !row.success && setExpanded((id) => (id === row.id ? null : row.id));
  const open = (row) => openDrawer(row.env, row.container_name, 'history');

  let body;
  if (q.isLoading) {
    body = <div className="space-y-2 p-4 lg:px-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  } else if (q.isError) {
    body = <p className="p-4 text-sm text-bad lg:px-6">Could not load history: {q.error.message}</p>;
  } else if (rows.length === 0) {
    body = (
      <div className="m-auto max-w-md p-8 text-center">
        <p className="mb-1 text-[15px] font-semibold">{all.length ? 'No matching actions' : 'No recorded actions yet'}</p>
        <p className="text-sm text-muted-foreground">
          {all.length ? 'Try a different container, action or tag.' : 'Deploys, restarts and other container actions show up here.'}
        </p>
      </div>
    );
  } else {
    body = (
      <>
        {/* Phones: one card per action */}
        <ul aria-label="History" className="divide-y md:hidden">
          {rows.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <li key={row.id} className="space-y-1 px-4 py-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <button type="button" className="h-10 min-w-0 truncate font-medium text-primary" onClick={() => open(row)}>
                    {row.container_name}
                  </button>
                  <span className="text-xs text-muted-foreground uppercase">{row.env}</span>
                  <span className="ml-auto"><Result row={row} /></span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{row.action}</span>
                  <TagChange row={row} />
                  <span title={row.timestamp}>{formatAgo(row.timestamp, now)}</span>
                  <span>{duration(row.duration_ms)}</span>
                </div>
                {!row.success && row.error_message && (
                  <>
                    <button type="button" aria-expanded={isOpen} className="inline-flex h-10 items-center gap-1 text-xs text-bad" onClick={() => toggle(row)}>
                      <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} aria-hidden="true" /> Error details
                    </button>
                    {isOpen && <pre className="overflow-auto rounded-md bg-bad-bg p-2 font-mono text-xs whitespace-pre-wrap text-bad">{row.error_message}</pre>}
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {/* Tablets and up: a table */}
        <table className="hidden w-full text-[13px] md:table">
          <thead className="sticky top-0 z-[1] bg-card text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="w-24 px-4 py-2 font-medium lg:pl-6">Time</th>
              <th className="px-2 py-2 font-medium">Env</th>
              <th className="px-2 py-2 font-medium">Container</th>
              <th className="px-2 py-2 font-medium">Action</th>
              <th className="px-2 py-2 font-medium">Tag change</th>
              <th className="px-2 py-2 font-medium">Result</th>
              <th className="px-4 py-2 text-right font-medium lg:pr-6">Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded === row.id;
              const expandable = !row.success && !!row.error_message;
              return (
                <Fragment key={row.id}>
                  <tr className={cn('border-b', rowHeight, !row.success && 'bg-bad-bg/40')}>
                    <td className="px-4 py-0 whitespace-nowrap text-muted-foreground lg:pl-6" title={row.timestamp}>{formatAgo(row.timestamp, now)}</td>
                    <td className="px-2 py-0 text-xs uppercase">{row.env}</td>
                    <td className="px-2 py-0">
                      <button type="button" className="font-medium hover:text-primary hover:underline" onClick={() => open(row)}>{row.container_name}</button>
                    </td>
                    <td className="px-2 py-0">{row.action}</td>
                    <td className="px-2 py-0"><TagChange row={row} /></td>
                    <td className="px-2 py-0">
                      {expandable ? (
                        <button type="button" aria-expanded={isOpen} aria-label={`failed — ${isOpen ? 'hide' : 'show'} error`} className="inline-flex items-center gap-1" onClick={() => toggle(row)}>
                          <Result row={row} />
                          <ChevronRight className={cn('size-3.5 text-bad transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                        </button>
                      ) : (
                        <Result row={row} />
                      )}
                    </td>
                    <td className="px-4 py-0 text-right tabular-nums text-muted-foreground lg:pr-6">{duration(row.duration_ms)}</td>
                  </tr>
                  {expandable && isOpen && (
                    <tr className="border-b">
                      <td colSpan={7} className="px-4 py-2 lg:px-6">
                        <pre className="overflow-auto rounded-md bg-bad-bg p-2 font-mono text-xs whitespace-pre-wrap text-bad">{row.error_message}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="History" subtitle="Deploys, restarts and other container actions" />
      <div className="flex flex-col gap-2 border-b bg-card px-4 py-3 sm:flex-row sm:items-center lg:px-6">
        <NativeSelect aria-label="Environment" className="sm:w-44" value={env} onChange={(e) => changeEnv(e.target.value)}>
          <option value="">All environments</option>
          {envKeys.map((k) => <option key={k} value={k}>{k}</option>)}
        </NativeSelect>
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Filter history" placeholder="Container, action or tag…" className="h-10 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {q.isFetching && !q.isLoading && <span className="text-xs text-muted-foreground sm:ml-auto">Refreshing…</span>}
      </div>
      <div className="flex-1">{body}</div>
      {!q.isLoading && !q.isError && hasMore && (
        <div className="flex justify-center border-t p-3">
          <Button variant="outline" className="h-10" disabled={q.isFetching} onClick={() => setLimit((l) => l + PAGE)}>
            {q.isFetching ? 'Loading…' : 'Load older actions'}
          </Button>
        </div>
      )}
    </div>
  );
}
