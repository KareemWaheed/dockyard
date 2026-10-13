import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Tag } from '@/components/status';
import { createCapRoverTarget, deleteCapRoverTarget, fetchCapRoverTargets, fetchProjects, testCapRoverTarget, updateCapRoverTarget } from '@/lib/api';
import { qk, useEnvKeys } from '@/lib/queries';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { Card, EmptyNote, Field, FormSheet, LoadError, LoadingList, SectionHeader } from '@/features/settings/ui';

const EMPTY = { project: '', env_key: '', name: '', caprover_url: '', app_name: '', app_token: '' };

export function describeTest(r) {
  if (r.warning) return r.warning;
  const instances = r.instanceCount != null ? ` (${r.instanceCount} instance${r.instanceCount === 1 ? '' : 's'})` : '';
  return `Connected — app '${r.appName}' found${instances}`;
}

export default function CapRoverSection() {
  const runCommand = useRunCommand();
  const envKeys = useEnvKeys();
  const q = useQuery({ queryKey: qk.caproverTargets, queryFn: fetchCapRoverTargets });
  const projectsQ = useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });
  const projects = projectsQ.data || {};
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'test'

  const isNew = editing === 'new';
  const openAdd = () => { setEditing('new'); setForm({ ...EMPTY }); setError(''); setTestResult(''); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({ project: t.project, env_key: t.env_key, name: t.name || '', caprover_url: t.caprover_url, app_name: t.app_name, app_token: '' });
    setError('');
    setTestResult('');
  };
  const close = () => setEditing(null);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setTestResult(''); // a changed field invalidates the last verdict
  };

  const test = async () => {
    const { caprover_url, app_name, app_token } = form;
    if (!caprover_url || !app_name) return setError('CapRover URL and app name are required to test.');
    if (!app_token && isNew) return setError('App token is required to test.');
    setBusy('test');
    setError('');
    setTestResult('');
    try {
      const r = await testCapRoverTarget({ caprover_url, app_name, app_token, id: isNew ? undefined : editing.id });
      if (r.ok === false) setError(`Test failed: ${r.error}`);
      else setTestResult(describeTest(r));
    } catch (err) {
      setError(`Test failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!form.project || !form.env_key || !form.caprover_url || !form.app_name) return setError('Project, environment, CapRover URL and app name are required.');
    // App tokens are scoped to one app, so a renamed app needs its own token.
    if ((isNew || form.app_name !== editing.app_name) && !form.app_token) return setError('App token is required for a new target or a changed app name.');
    setError('');
    setBusy('save');
    const r = await runCommand({
      pending: 'Saving CapRover target…',
      success: `${form.name || form.app_name} saved`,
      failure: 'Could not save the CapRover target',
      fn: () => (isNew ? createCapRoverTarget(form) : updateCapRoverTarget(editing.id, form)),
      invalidate: [qk.caproverTargets],
    });
    setBusy(null);
    if (r) close();
  };

  const remove = (t) =>
    runCommand({
      confirm: { title: `Remove ${t.name || t.app_name}?`, description: `Builds of ${projects[t.project]?.name || t.project} can no longer deploy to ${t.app_name} on ${t.env_key}.`, confirmLabel: 'Remove target', destructive: true },
      pending: 'Removing target…',
      success: 'CapRover target removed',
      failure: 'Could not remove the target',
      fn: () => deleteCapRoverTarget(t.id),
      invalidate: [qk.caproverTargets],
    });

  const targets = q.data || [];
  return (
    <>
      <SectionHeader
        title="CapRover deploy targets"
        description="Map a build project and environment to a CapRover app, so finished builds can deploy straight to it. The app token comes from the app's Deployment tab in CapRover and can only deploy that one app."
      >
        <Button className="h-10" onClick={openAdd}><Plus className="size-4" /> Add target</Button>
      </SectionHeader>
      {q.isLoading ? <LoadingList /> : q.isError ? <LoadError what="CapRover targets" error={q.error} /> : targets.length === 0 ? (
        <EmptyNote>No CapRover targets yet. Add one to enable deploys from Builds.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {targets.map((t) => (
            <li key={t.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.name || t.app_name}</span>
                    <Tag className="uppercase">{t.env_key}</Tag>
                    <span className="text-xs text-muted-foreground">{projects[t.project]?.name || t.project}</span>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">{t.caprover_url} → {t.app_name}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="size-10" aria-label={`Edit ${t.name || t.app_name}`} onClick={() => openEdit(t)}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-10 text-bad hover:text-bad" aria-label={`Remove ${t.name || t.app_name}`} onClick={() => remove(t)}><Trash2 className="size-4" /></Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <FormSheet
        open={!!editing}
        onOpenChange={(o) => !o && close()}
        title={isNew ? 'Add CapRover target' : 'Edit CapRover target'}
        onSubmit={save}
        saving={busy === 'save'}
        error={error}
        extraActions={
          <Button type="button" variant="outline" className="h-10 sm:mr-auto" disabled={!!busy} onClick={test}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </Button>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Build project" htmlFor="cr-project">
              <NativeSelect id="cr-project" value={form.project} onChange={set('project')}>
                <option value="">Select project…</option>
                {Object.keys(projects).map((k) => <option key={k} value={k}>{projects[k].name || k}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Environment key" htmlFor="cr-env">
              <Input id="cr-env" className="h-10 font-mono" list="cr-env-keys" placeholder="e.g. test, prod" value={form.env_key} onChange={set('env_key')} />
              <datalist id="cr-env-keys">{envKeys.map((k) => <option key={k} value={k} />)}</datalist>
            </Field>
            <Field label="Label" htmlFor="cr-name" hint="Optional display name." className="sm:col-span-2">
              <Input id="cr-name" className="h-10" value={form.name} onChange={set('name')} />
            </Field>
            <Field label="CapRover URL" htmlFor="cr-url" className="sm:col-span-2">
              <Input id="cr-url" className="h-10 font-mono" placeholder="https://captain.example.com" value={form.caprover_url} onChange={set('caprover_url')} />
            </Field>
            <Field label="App name" htmlFor="cr-app">
              <Input id="cr-app" className="h-10 font-mono" placeholder="my-frontend" value={form.app_name} onChange={set('app_name')} />
            </Field>
            <Field label="App token" htmlFor="cr-token" hint={isNew ? undefined : 'Leave blank to keep the current token. Required if you change the app name.'}>
              <Input id="cr-token" type="password" className="h-10 font-mono" autoComplete="new-password" value={form.app_token} onChange={set('app_token')} />
            </Field>
            {testResult && (
              <p role="status" className="flex items-center gap-2 text-sm text-ok sm:col-span-2">
                <CheckCircle2 className="size-4" aria-hidden="true" /> {testResult}
              </p>
            )}
          </div>
        )}
      </FormSheet>
    </>
  );
}
