import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchDeploySuggestions } from '@/lib/api';
import { flattenEnv } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { qk, useAllEnvs, usePendingAction } from '@/lib/queries';
import { useDrawer } from '@/features/container/useDrawer';
import { useRunAction } from '@/features/container/useRunAction';
import { buildSuggestionGroups } from '@/features/container/suggestions';
import { TagCombobox } from '@/features/container/TagCombobox';

export function DeployTab({ env, container }) {
  const run = useRunAction(env);
  const { prefillTag } = useDrawer();
  const all = useAllEnvs();
  const pending = usePendingAction(env, container.name);
  const service = container.serviceName || container.name;
  const current = imageTag(container.image);
  const [selected, setSelected] = useState(prefillTag || '');
  const deployRef = useRef(null);

  const otherEnvs = all
    .filter((e) => e.env !== env && e.data && !e.isError)
    .flatMap((e) => {
      const match = flattenEnv(e.data).find((c) => !c.standalone && (c.serviceName || c.name) === service);
      return match ? [{ env: e.env, tag: imageTag(match.image) }] : [];
    });

  const sugg = useQuery({
    queryKey: qk.suggestions(env, service, container.image, current),
    queryFn: () => fetchDeploySuggestions(env, service, { image: container.image, current }),
    staleTime: 30000,
  });

  const groups = buildSuggestionGroups({
    env,
    current,
    otherEnvs,
    recentBuilds: sugg.data?.recentBuilds ?? [],
    previous: sugg.data?.previous ?? [],
  });

  const deploy = async () => {
    if (!selected) return;
    if (await run(container, 'deploy', { newTag: selected })) setSelected('');
  };
  const busy = !!pending;

  return (
    <div className="space-y-4">
      <TagCombobox
        groups={groups}
        initialQuery={prefillTag || ''}
        onPick={(tag) => {
          setSelected(tag);
          requestAnimationFrame(() => deployRef.current?.focus());
        }}
      />
      {sugg.isError && <p className="text-xs text-muted-foreground">Build and history suggestions unavailable: {sugg.error.message}</p>}
      <div data-testid="deploy-preview" className="rounded-md bg-muted px-3 py-2 font-mono text-[12.5px]">
        {current} → <b>{selected || '…'}</b>
      </div>
      <Button ref={deployRef} className="w-full" disabled={!selected || busy} onClick={deploy}>
        Deploy to {env.toUpperCase()}
      </Button>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(container, 'restart')}>Restart</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(container, 'pull-recreate')}>Pull &amp; recreate</Button>
        {/* modal={false}: the confirm dialog opens right after a menu item is chosen */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy}>More <ChevronDown className="size-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => run(container, 'force-recreate')}>Force recreate</DropdownMenuItem>
            {container.status === 'running' ? (
              <DropdownMenuItem variant="destructive" onSelect={() => run(container, 'stop')}>Stop</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => run(container, 'start')}>Start</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => run(container, 'unmanage')}>Unmanage…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
