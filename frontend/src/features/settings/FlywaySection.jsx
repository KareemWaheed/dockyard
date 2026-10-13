import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createFlywayDatabase, createFlywayEnv, deleteFlywayDatabase, deleteFlywayEnv,
  fetchFlywayEnvs, updateFlywayDatabase, updateFlywayEnv,
} from '@/lib/api';
import { qk } from '@/lib/queries';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { Card, EmptyNote, Field, FormSheet, LoadError, LoadingList, SectionHeader, SwitchField } from '@/features/settings/ui';

const DEFAULT_LOCATIONS = 'filesystem:src/main/resources/db/migration/';
const EMPTY_ENV = { name: '', description: '' };
const EMPTY_DB = {
  name: '', url: '', db_user: '', db_password: '', schemas: '',
  locations: DEFAULT_LOCATIONS, baseline_on_migrate: true, baseline_version: '1',
};

export default function FlywaySection() {
  const runCommand = useRunCommand();
  const q = useQuery({ queryKey: qk.flywayEnvs, queryFn: fetchFlywayEnvs });
  // { kind: 'env' | 'db', id?, envId?, form }
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const open = (next) => { setError(''); setEditing(next); };
  const close = () => setEditing(null);
  const setForm = (k, v) => setEditing((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  const save = async () => {
    const { kind, id, envId, form } = editing;
    if (kind === 'env' && !form.name.trim()) return setError('Name is required.');
    if (kind === 'db') {
      if (!form.name || !form.url || !form.db_user || !form.schemas) return setError('Name, JDBC URL, username and schemas are required.');
      if (!id && !form.db_password) return setError('Password is required for a new database.');
    }
    setError('');
    setSaving(true);
    const r = await runCommand({
      pending: 'Saving…',
      success: `${form.name} saved`,
      failure: kind === 'env' ? 'Could not save the environment' : 'Could not save the database',
      fn: () => {
        if (kind === 'env') return id ? updateFlywayEnv(id, form) : createFlywayEnv(form);
        return id ? updateFlywayDatabase(id, form) : createFlywayDatabase(envId, form);
      },
      invalidate: [qk.flywayEnvs],
    });
    setSaving(false);
    if (r) close();
  };

  const removeEnv = (env) =>
    runCommand({
      confirm: { title: `Delete ${env.name}?`, description: `Removes the environment and its ${env.databases.length} database configuration${env.databases.length === 1 ? '' : 's'}. The databases themselves are untouched.`, confirmLabel: 'Delete environment', destructive: true },
      pending: `Deleting ${env.name}…`,
      success: `${env.name} deleted`,
      failure: `Could not delete ${env.name}`,
      fn: () => deleteFlywayEnv(env.id),
      invalidate: [qk.flywayEnvs],
    });

  const removeDb = (db) =>
    runCommand({
      confirm: { title: `Remove ${db.name}?`, description: 'Removes this database configuration from Dockyard. The database itself is untouched.', confirmLabel: 'Remove database', destructive: true },
      pending: `Removing ${db.name}…`,
      success: `${db.name} removed`,
      failure: `Could not remove ${db.name}`,
      fn: () => deleteFlywayDatabase(db.id),
      invalidate: [qk.flywayEnvs],
    });

  const editDb = (d, envId) =>
    open({
      kind: 'db', id: d.id, envId,
      form: {
        name: d.name, url: d.url, db_user: d.db_user, db_password: '', schemas: d.schemas,
        locations: d.locations || DEFAULT_LOCATIONS, baseline_on_migrate: !!d.baseline_on_migrate, baseline_version: d.baseline_version ?? '1',
      },
    });

  const envs = q.data || [];
  const form = editing?.form;
  return (
    <>
      <SectionHeader title="Flyway" description="Environments and databases that Migrations can run against.">
        <Button className="h-10" onClick={() => open({ kind: 'env', form: { ...EMPTY_ENV } })}><Plus className="size-4" /> Add environment</Button>
      </SectionHeader>
      {q.isLoading ? <LoadingList /> : q.isError ? <LoadError what="Flyway environments" error={q.error} /> : envs.length === 0 ? (
        <EmptyNote>No environments yet. Add one, then add its databases.</EmptyNote>
      ) : (
        <ul className="space-y-3">
          {envs.map((env) => (
            <li key={env.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{env.name}</h3>
                    {env.description && <p className="text-xs text-muted-foreground">{env.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="size-10" aria-label={`Edit ${env.name}`} onClick={() => open({ kind: 'env', id: env.id, form: { name: env.name, description: env.description || '' } })}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="size-10 text-bad hover:text-bad" aria-label={`Delete ${env.name}`} onClick={() => removeEnv(env)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                <ul className="divide-y rounded-md border" aria-label={`${env.name} databases`}>
                  {env.databases.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                      <Database className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{d.url} · {d.schemas}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="size-10" aria-label={`Edit ${d.name}`} onClick={() => editDb(d, env.id)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="size-10 text-bad hover:text-bad" aria-label={`Remove ${d.name}`} onClick={() => removeDb(d)}><Trash2 className="size-4" /></Button>
                    </li>
                  ))}
                  <li>
                    <Button variant="ghost" className="h-10 w-full justify-start rounded-none text-muted-foreground" onClick={() => open({ kind: 'db', envId: env.id, form: { ...EMPTY_DB } })}>
                      <Plus className="size-4" /> Add database
                    </Button>
                  </li>
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <FormSheet
        open={!!editing}
        onOpenChange={(o) => !o && close()}
        title={editing?.kind === 'db' ? (editing.id ? `Edit ${form.name}` : 'Add database') : editing?.id ? 'Edit environment' : 'Add environment'}
        onSubmit={save}
        saving={saving}
        error={error}
      >
        {editing?.kind === 'env' && (
          <div className="grid gap-4">
            <Field label="Name" htmlFor="fw-env-name"><Input id="fw-env-name" className="h-10" placeholder="e.g. Test" value={form.name} onChange={(e) => setForm('name', e.target.value)} /></Field>
            <Field label="Description" htmlFor="fw-env-desc"><Input id="fw-env-desc" className="h-10" placeholder="Optional" value={form.description} onChange={(e) => setForm('description', e.target.value)} /></Field>
          </div>
        )}
        {editing?.kind === 'db' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="fw-db-name"><Input id="fw-db-name" className="h-10" placeholder="core_db" value={form.name} onChange={(e) => setForm('name', e.target.value)} /></Field>
            <Field label="Schemas" htmlFor="fw-db-schemas"><Input id="fw-db-schemas" className="h-10 font-mono" placeholder="public" value={form.schemas} onChange={(e) => setForm('schemas', e.target.value)} /></Field>
            <Field label="JDBC URL" htmlFor="fw-db-url" className="sm:col-span-2"><Input id="fw-db-url" className="h-10 font-mono" placeholder="jdbc:postgresql://10.0.0.5:5432/core_db" value={form.url} onChange={(e) => setForm('url', e.target.value)} /></Field>
            <Field label="Username" htmlFor="fw-db-user"><Input id="fw-db-user" className="h-10 font-mono" autoComplete="off" value={form.db_user} onChange={(e) => setForm('db_user', e.target.value)} /></Field>
            <Field label="Password" htmlFor="fw-db-pass" hint={editing.id ? 'Leave blank to keep the current password.' : undefined}>
              <Input id="fw-db-pass" type="password" className="h-10" autoComplete="new-password" value={form.db_password} onChange={(e) => setForm('db_password', e.target.value)} />
            </Field>
            <Field label="Locations" htmlFor="fw-db-loc" className="sm:col-span-2"><Input id="fw-db-loc" className="h-10 font-mono" value={form.locations} onChange={(e) => setForm('locations', e.target.value)} /></Field>
            <Field label="Baseline version" htmlFor="fw-db-bv"><Input id="fw-db-bv" className="h-10 font-mono" value={form.baseline_version} onChange={(e) => setForm('baseline_version', e.target.value)} /></Field>
            <div className="flex items-end pb-2">
              <SwitchField id="fw-db-bom" label="Baseline on migrate" checked={form.baseline_on_migrate} onCheckedChange={(v) => setForm('baseline_on_migrate', v)} />
            </div>
          </div>
        )}
      </FormSheet>
    </>
  );
}
