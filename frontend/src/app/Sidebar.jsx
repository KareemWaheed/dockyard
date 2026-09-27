import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { Database, Hammer, History, LayoutGrid, Moon, Rows3, Settings, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DockyardLogo } from '@/components/DockyardLogo';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot, toneText } from '@/components/status';
import { useTheme } from '@/app/ThemeProvider';
import { envSummary } from '@/app/envSummary';
import { useAllEnvs } from '@/lib/queries';
import { useBuildActivity } from '@/features/activity/useBuildActivity';
import { cn } from '@/lib/utils';

const itemClass = ({ isActive }) =>
  cn(
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
    isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

function SectionLabel({ children }) {
  return <div className="mt-4 mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</div>;
}

export default function Sidebar({ onNavigate }) {
  const envs = useAllEnvs();
  const { count: activeBuilds } = useBuildActivity();
  const { theme, toggleTheme, density, setDensity } = useTheme();
  const [buildInfo, setBuildInfo] = useState(null);

  useEffect(() => {
    fetch('/build-info.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setBuildInfo)
      .catch(() => {});
  }, []);

  return (
    <nav aria-label="Main" className="flex h-full w-full flex-col p-3">
      <div className="mb-3 flex items-center gap-2 px-2 text-[15px] font-semibold">
        <DockyardLogo className="size-6" /> Dockyard
      </div>
      <NavLink to="/" end className={itemClass} onClick={onNavigate}>
        <LayoutGrid className="size-4" aria-hidden="true" /> Overview
      </NavLink>

      <SectionLabel>Environments</SectionLabel>
      {envs.map((e) => {
        const s = envSummary(e);
        return (
          <NavLink key={e.env} to={`/env/${encodeURIComponent(e.env)}`} className={itemClass} onClick={onNavigate}>
            <StatusDot tone={s.tone} />
            <span className="flex-1">{e.env}</span>
            {s.status === 'loading' ? (
              <Skeleton className="h-3 w-6" />
            ) : (
              <span className={cn('text-[11px]', s.tone === 'ok' ? 'text-muted-foreground' : toneText[s.tone])}>{s.label}</span>
            )}
          </NavLink>
        );
      })}

      <SectionLabel>Tools</SectionLabel>
      <NavLink to="/builds" className={itemClass} onClick={onNavigate}>
        <Hammer className="size-4" aria-hidden="true" /> <span className="flex-1">Builds</span>
        {activeBuilds > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-foreground">{activeBuilds}</span>}
      </NavLink>
      <NavLink to="/migrations" className={itemClass} onClick={onNavigate}>
        <Database className="size-4" aria-hidden="true" /> Migrations
      </NavLink>
      <NavLink to="/history" className={itemClass} onClick={onNavigate}>
        <History className="size-4" aria-hidden="true" /> History
      </NavLink>
      <NavLink to="/settings" className={itemClass} onClick={onNavigate}>
        <Settings className="size-4" aria-hidden="true" /> Settings
      </NavLink>

      <div className="mt-auto flex items-center gap-2 px-2 pt-4 text-[11px] text-muted-foreground">
        <Button variant="ghost" size="icon" className="size-7" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={density === 'compact' ? 'Use comfortable rows' : 'Use compact rows'}
          aria-pressed={density === 'compact'}
          onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        >
          <Rows3 className="size-4" />
        </Button>
        {buildInfo?.shortCommit && buildInfo.shortCommit !== 'unknown' && (
          <span title={`Branch: ${buildInfo.branch}\nCommit: ${buildInfo.commit}\nBuilt: ${buildInfo.buildTime}`}>
            build {buildInfo.shortCommit}
          </span>
        )}
      </div>
    </nav>
  );
}
