import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchBranches, startFlywayRun } from '@/lib/api';
import { qk } from '@/lib/queries';
import { isProd } from '@/features/container/actions';
import { ComboPicker } from '@/features/runs/ComboPicker';
import { useRunCommand } from '@/features/runs/useRunCommand';

export function MigrationForm({ projects, envs, busy, onStarted }) {
  const runCommand = useRunCommand();
  const keys = Object.keys(projects);
  const [project, setProject] = useState(keys[0] || '');
  const [branch, setBranch] = useState('');
  const [envId, setEnvId] = useState(envs[0] ? String(envs[0].id) : '');
  const [dbId, setDbId] = useState(envs[0]?.databases[0] ? String(envs[0].databases[0].id) : '');

  useEffect(() => {
    if (!project && keys[0]) setProject(keys[0]);
  }, [project, keys]);
  useEffect(() => {
    if (!envId && envs[0]) {
      setEnvId(String(envs[0].id));
      setDbId(envs[0].databases[0] ? String(envs[0].databases[0].id) : '');
    }
  }, [envId, envs]);

  const branchesQ = useQuery({ queryKey: qk.branches(project), queryFn: () => fetchBranches(project), enabled: !!project, staleTime: 30000 });
  const branches = branchesQ.data?.branches || [];
  const needsClone = !!branchesQ.data?.needsClone;
  // Keep the chosen branch across refreshes; only fall back to the first when it disappears.
  useEffect(() => {
    setBranch((current) => (current && branches.includes(current) ? current : branches[0] || ''));
  }, [project, branchesQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const env = envs.find((e) => String(e.id) === envId);
  const database = env?.databases.find((d) => String(d.id) === dbId);
  const canRun = !!(project && branch && env && database && !needsClone && !busy);

  const changeEnv = (id) => {
    setEnvId(id);
    const next = envs.find((e) => String(e.id) === id);
    setDbId(next?.databases[0] ? String(next.databases[0].id) : '');
  };

  // Guard against double-clicks starting two Flyway processes before `busy` catches up.
  const inFlight = useRef(false);
  const run = async (command) => {
    if (!canRun || inFlight.current) return;
    inFlight.current = true;
    try {
      await start(command);
    } finally {
      inFlight.current = false;
    }
  };

  const start = async (command) => {
    const where = `${env.name} / ${database.name}`;
    const r = await runCommand({
      confirm:
        command === 'migrate'
          ? {
              title: `Run migrate on ${where}?`,
              description: `Applies pending migrations from ${project}@${branch} to ${where}. This changes the database schema.`,
              confirmLabel: 'Run migrate',
              destructive: true,
              level: isProd(env.name) ? 'typed' : 'confirm',
              typedValue: database.name,
            }
          : undefined,
      pending: `Starting ${command} on ${where}…`,
      success: (res) => `Migration run #${res.runNumber} started`,
      failure: `Could not start ${command}`,
      fn: () => startFlywayRun({ envId: env.id, dbId: database.id, project, branch, command }),
      invalidate: [qk.flywayRuns],
    });
    if (r) onStarted(r.runId);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="mig-project">Project</Label>
          <NativeSelect id="mig-project" value={project} onChange={(e) => setProject(e.target.value)}>
            {keys.map((k) => <option key={k} value={k}>{projects[k].name || k}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mig-branch">Branch</Label>
          {branchesQ.isLoading ? (
            <Skeleton className="h-10" />
          ) : needsClone ? (
            <p className="flex h-10 items-center text-sm text-warn">
              Repo not cloned — clone it from&nbsp;<Link className="underline" to={`/builds/${encodeURIComponent(project)}`}>Builds</Link>
            </p>
          ) : branchesQ.isError ? (
            <p className="flex h-10 items-center text-sm text-bad">Could not load branches.</p>
          ) : (
            <ComboPicker id="mig-branch" mono options={branches.map((b) => ({ value: b, label: b }))} value={branch} onChange={setBranch} placeholder="Select branch…" searchLabel="Search branches" emptyText="No matching branch." />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mig-env">Environment</Label>
          <NativeSelect id="mig-env" value={envId} onChange={(e) => changeEnv(e.target.value)}>
            {envs.length === 0 && <option value="">No environments</option>}
            {envs.map((e) => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mig-db">Database</Label>
          <NativeSelect id="mig-db" value={dbId} disabled={!env?.databases.length} onChange={(e) => setDbId(e.target.value)}>
            {!env?.databases.length && <option value="">No databases</option>}
            {(env?.databases || []).map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {busy && <p className="text-xs text-muted-foreground sm:mr-auto">A migration is running.</p>}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" className="h-10" disabled={!canRun} onClick={() => run('info')}>Info</Button>
          <Button className="h-10 bg-warn text-white hover:bg-warn/90" disabled={!canRun} onClick={() => run('migrate')}>Migrate</Button>
        </div>
      </div>
    </div>
  );
}
