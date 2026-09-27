import { useNavigate, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { StatusDot } from '@/components/status';
import { flattenEnv, describeState } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { fetchProjects } from '@/lib/api';
import { qk, useAllEnvs } from '@/lib/queries';
import { useTheme } from '@/app/ThemeProvider';
import { useLayout } from '@/app/layoutContext';
import { useDrawer } from '@/features/container/useDrawer';
import { useFocusedCell } from '@/features/overview/focusStore';

const PAGES = [
  ['Overview', '/'],
  ['Builds', '/builds'],
  ['Migrations', '/migrations'],
  ['History', '/history'],
  ['Settings', '/settings'],
];

export function CommandPalette({ open, onOpenChange }) {
  const envs = useAllEnvs();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { toggleTheme, setDensity, density } = useTheme();
  const { toggleActivity } = useLayout();
  const { openDrawer } = useDrawer();
  const focused = useFocusedCell();
  const projects = useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });
  const projectEntries = Object.entries(projects.data || {});

  const go = (fn) => () => {
    onOpenChange(false);
    fn();
  };
  const containers = envs.flatMap((e) => flattenEnv(e.data).map((c) => ({ env: e.env, c })));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search containers, environments, pages and actions">
      <CommandInput placeholder="Search containers, environments, pages, actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {location.pathname === '/' && focused && (
          <CommandGroup heading="Focused cell">
            <CommandItem value={`deploy ${focused.service} ${focused.env}`} onSelect={go(() => openDrawer(focused.env, focused.containerName, 'deploy'))}>
              Deploy {focused.service} to {focused.env.toUpperCase()}…
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Containers">
          {containers.map(({ env, c }) => (
            <CommandItem key={`${env}/${c.name}`} value={`${c.serviceName || c.name} ${env} ${c.name}`} onSelect={go(() => openDrawer(env, c.name, 'deploy'))}>
              <StatusDot tone={describeState(c).tone} />
              {c.serviceName || c.name} · {env.toUpperCase()} · {imageTag(c.image)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Environments">
          {envs.map((e) => (
            <CommandItem key={e.env} value={`env ${e.env}`} onSelect={go(() => navigate(`/env/${encodeURIComponent(e.env)}`))}>
              {e.env}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Pages">
          {PAGES.map(([label, path]) => (
            <CommandItem key={path} value={`page ${label}`} onSelect={go(() => navigate(path))}>{label}</CommandItem>
          ))}
        </CommandGroup>
        {projectEntries.length > 0 && (
          <CommandGroup heading="Builds">
            {projectEntries.map(([key, p]) => (
              <CommandItem key={`builds-${key}`} value={`builds ${p.name || key}`} onSelect={go(() => navigate(`/builds/${encodeURIComponent(key)}`))}>
                Builds: {p.name || key}
              </CommandItem>
            ))}
            {projectEntries.map(([key, p]) => (
              <CommandItem key={`new-${key}`} value={`new build ${p.name || key}`} onSelect={go(() => navigate(`/builds/${encodeURIComponent(key)}?new=1`))}>
                New build: {p.name || key}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Actions">
          <CommandItem value="toggle theme dark light" onSelect={go(toggleTheme)}>Toggle theme</CommandItem>
          <CommandItem value="toggle compact rows density" onSelect={go(() => setDensity(density === 'compact' ? 'comfortable' : 'compact'))}>Toggle compact rows</CommandItem>
          <CommandItem value="toggle activity panel" onSelect={go(toggleActivity)}>Toggle activity panel</CommandItem>
          <CommandItem value="refresh all environments" onSelect={go(() => qc.refetchQueries({ queryKey: ['containers'] }))}>Refresh all</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
