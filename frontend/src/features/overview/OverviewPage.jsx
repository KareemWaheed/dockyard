import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllEnvs, useServers } from '@/lib/queries';
import { usePref } from '@/lib/storage';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { useDrawer } from '@/features/container/useDrawer';
import { buildMatrix } from '@/features/overview/buildMatrix';
import { computeDrift } from '@/features/overview/drift';
import { OverviewMatrix } from '@/features/overview/OverviewMatrix';

function Toggle({ id, label, checked, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="text-[13px] font-normal">{label}</Label>
    </div>
  );
}

export default function OverviewPage() {
  const servers = useServers();
  const results = useAllEnvs();
  const [filter, setFilter] = useState('');
  const [onlyDiff, setOnlyDiff] = usePref('onlyDifferences', false);
  const [showUnmanaged, setShowUnmanaged] = usePref('showUnmanaged', false);
  const { openDrawer } = useDrawer();
  const qc = useQueryClient();
  const now = useNow(1000);
  const filterRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        filterRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (servers.isSuccess && servers.data.length === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
            <p className="mb-1 text-[15px] font-semibold">No servers yet</p>
            <p className="mb-4 text-muted-foreground">Dockyard connects to your servers over SSH and reads their compose files.</p>
            <Button asChild><Link to="/settings">Add your first server</Link></Button>
          </div>
        </div>
      </>
    );
  }

  const matrix = buildMatrix(results, { showUnmanaged });
  const envOrder = matrix.envs.map((e) => e.env);
  const needle = filter.trim().toLowerCase();
  const rows = matrix.rows
    .filter((r) => r.service.toLowerCase().includes(needle))
    .filter((r) => !onlyDiff || Object.keys(computeDrift(r, envOrder)).length > 0);
  const updated = results.map((r) => r.dataUpdatedAt).filter(Boolean);
  const ageSecs = updated.length ? Math.max(0, Math.round((now - Math.min(...updated)) / 1000)) : null;
  const fetching = results.some((r) => r.isFetching);
  const loadingFirst = matrix.rows.length === 0 && results.some((r) => r.isLoading);

  return (
    <>
      <PageHeader title="Overview">
        <Input
          ref={filterRef}
          type="search"
          aria-label="Filter services"
          placeholder="Filter services…  /"
          className="h-8 w-52"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Toggle id="only-diff" label="Only differences" checked={onlyDiff} onChange={setOnlyDiff} />
        <Toggle id="show-unmanaged" label="Show unmanaged" checked={showUnmanaged} onChange={setShowUnmanaged} />
        <Button variant="outline" size="sm" onClick={() => qc.refetchQueries({ queryKey: ['containers'] })} aria-label="Refresh all environments">
          <RefreshCw className={cn('size-3.5', fetching && 'animate-spin')} />
          {ageSecs === null ? '—' : `${ageSecs}s`}
        </Button>
      </PageHeader>
      <div className="p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          {loadingFirst ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">{needle || onlyDiff ? 'No services match.' : 'No managed services found.'}</p>
          ) : (
            <OverviewMatrix envs={matrix.envs} rows={rows} onOpen={openDrawer} />
          )}
        </div>
      </div>
    </>
  );
}
