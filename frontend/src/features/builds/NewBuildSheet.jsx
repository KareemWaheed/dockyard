import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cloneRepo, fetchBranches, startBuild } from '@/lib/api';
import { qk } from '@/lib/queries';
import { ComboPicker } from '@/features/runs/ComboPicker';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { argsToValues, buildArgs, initFormState, isFormValid } from '@/features/builds/buildArgs';
import { loadRecent, saveRecent } from '@/features/builds/recentStore';
import { ParamField } from '@/features/builds/ParamField';

export function NewBuildSheet({ project, def, fromRun, open, onOpenChange, onStarted }) {
  const runCommand = useRunCommand();
  const params = def?.params || [];
  const branchesQ = useQuery({ queryKey: qk.branches(project), queryFn: () => fetchBranches(project), enabled: open && !!project, staleTime: 30000 });
  const [branch, setBranch] = useState('');
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (fromRun) {
      // "Change parameters…" on a run: start from exactly what that run used.
      setValues(argsToValues(params, fromRun.args_json));
      setBranch(fromRun.branch || '');
    } else {
      const recent = loadRecent(project);
      setValues(initFormState(params, recent?.values));
      setBranch(recent?.branch || '');
    }
    // params come from the same project def; re-init only when the sheet opens or its source changes
  }, [open, project, fromRun?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const branches = branchesQ.data?.branches || [];
  useEffect(() => {
    if (open && !branch && branches.length) setBranch(branches[0]);
  }, [open, branch, branches]);

  const needsClone = !!branchesQ.data?.needsClone;
  const valid = !needsClone && isFormValid(params, values, branch);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    saveRecent(project, { branch, values });
    const r = await runCommand({
      pending: `Starting ${def.name} build…`,
      success: (res) => `Build #${res.buildNumber} ${res.queued ? 'queued' : 'started'}`,
      failure: 'Could not start the build',
      fn: () => startBuild(project, branch, buildArgs(params, values)),
      invalidate: [qk.buildRuns(project)],
    });
    setSubmitting(false);
    if (r) {
      onOpenChange(false);
      onStarted(r.buildNumber);
    }
  };

  const clone = async () => {
    if (cloning) return;
    setCloning(true);
    const r = await runCommand({
      pending: `Cloning ${def.name}…`,
      success: (res) => (res.alreadyCloned ? 'Repository already cloned' : `Clone #${res.buildNumber} started`),
      failure: 'Could not clone the repository',
      fn: () => cloneRepo(project),
      invalidate: [qk.buildRuns(project), qk.branches(project)],
    });
    setCloning(false);
    if (r && !r.alreadyCloned) {
      onOpenChange(false);
      onStarted(r.buildNumber);
    }
  };

  let body;
  if (branchesQ.isLoading) {
    body = <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><p className="text-xs text-muted-foreground">Fetching branches…</p></div>;
  } else if (branchesQ.isError) {
    body = (
      <div className="space-y-2 text-sm">
        <p className="text-bad">Could not load branches: {branchesQ.error.message}</p>
        <Button type="button" variant="outline" className="h-10" onClick={() => branchesQ.refetch()}>Retry</Button>
      </div>
    );
  } else if (needsClone) {
    body = (
      <div className="space-y-3 text-sm">
        <p>This project's repository hasn't been cloned on the server yet.</p>
        <Button type="button" className="h-10" disabled={cloning} onClick={clone}>Clone repository</Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="build-branch">Branch<span className="text-bad" aria-hidden="true"> *</span></Label>
          <ComboPicker id="build-branch" mono options={branches.map((b) => ({ value: b, label: b }))} value={branch} onChange={setBranch} placeholder="Select branch…" searchLabel="Search branches" emptyText="No matching branch." />
        </div>
        {params.map((p) => (
          <ParamField key={p.name} param={p} value={values[p.name]} onChange={(v) => setValues((prev) => ({ ...prev, [p.name]: v }))} />
        ))}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader className="border-b p-4">
            <SheetTitle>New build — {def?.name}{fromRun ? ` (from #${fromRun.build_number})` : ''}</SheetTitle>
            <SheetDescription>Build and push a new image.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">{body}</div>
          {!needsClone && !branchesQ.isError && (
            <SheetFooter className="border-t p-4">
              <Button type="submit" className="h-10 w-full" disabled={!valid || submitting}>Build &amp; push</Button>
            </SheetFooter>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
