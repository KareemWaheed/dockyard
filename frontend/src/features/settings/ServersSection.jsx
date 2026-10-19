import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NativeSelect } from '@/components/ui/native-select';
import { Tag } from '@/components/status';
import { createSettingsServer, deleteSettingsServer, updateSettingsServer } from '@/lib/api';
import { isServerEnabled, qk, useServers } from '@/lib/queries';
import { useSetServerEnabled } from '@/features/settings/useSetServerEnabled';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { isProd } from '@/features/container/actions';
import { Card, EmptyNote, Field, FormSheet, LoadError, LoadingList, SectionHeader, textareaClass } from '@/features/settings/ui';

const emptyStack = () => ({ name: '', path: '', versionInfo: [] });
const EMPTY_FORM = {
  env_key: '', name: '', host: '', ssh_username: '',
  auth_method: 'password', ssh_password: '', ssh_key_path: '', ssh_key_content: '',
  ssh_passphrase: '', docker_compose_cmd: 'docker compose', aws_sg_id: '',
  maintenance_flag_path: '',
};

// versionInfo is stored server-side as a { [serviceName]: { path, format } } map;
// the form edits it as rows for easier add/remove.
const versionInfoMapToRows = (vi) =>
  Object.entries(vi || {}).map(([serviceName, v]) => ({ serviceName, path: v.path, format: v.format || 'properties' }));
const versionInfoRowsToMap = (rows) =>
  Object.fromEntries((rows || []).filter((r) => r.serviceName && r.path).map((r) => [r.serviceName, { path: r.path, format: r.format }]));

export function serverToForm(s) {
  return {
    env_key: s.env_key, name: s.name || '', host: s.host || '', ssh_username: s.ssh_username || '',
    auth_method: s.ssh_password ? 'password' : s.ssh_key_content ? 'paste' : s.ssh_key_path ? 'path' : 'password',
    ssh_password: s.ssh_password || '', ssh_key_path: s.ssh_key_path || '',
    ssh_key_content: s.ssh_key_content || '', ssh_passphrase: s.ssh_passphrase || '',
    docker_compose_cmd: s.docker_compose_cmd || 'docker compose', aws_sg_id: s.aws_sg_id || '',
    maintenance_flag_path: s.maintenance_flag_path || '',
    stacks: s.stacks?.length
      ? s.stacks.map((st) => ({ name: st.name, path: st.path, versionInfo: versionInfoMapToRows(st.versionInfo) }))
      : [emptyStack()],
  };
}

const CREDENTIAL = {
  password: ['ssh_password', 'An SSH password is required.'],
  path: ['ssh_key_path', 'A key file path is required.'],
  paste: ['ssh_key_content', 'A private key is required.'],
};

// Returns an error message, or '' when the form can be saved.
export function validateServer(form) {
  if (!form.env_key.trim() || !form.host.trim() || !form.ssh_username.trim()) return 'Environment key, host and SSH username are required.';
  const [field, message] = CREDENTIAL[form.auth_method];
  if (!form[field]?.trim()) return message;
  return '';
}

export function formToBody(form) {
  return {
    env_key: form.env_key.trim(), name: form.name, host: form.host, ssh_username: form.ssh_username,
    ssh_password: form.auth_method === 'password' ? form.ssh_password : null,
    ssh_key_path: form.auth_method === 'path' ? form.ssh_key_path : null,
    ssh_key_content: form.auth_method === 'paste' ? form.ssh_key_content : null,
    ssh_passphrase: form.auth_method !== 'password' ? form.ssh_passphrase : null,
    docker_compose_cmd: form.docker_compose_cmd,
    aws_sg_id: form.aws_sg_id || null,
    maintenance_flag_path: form.maintenance_flag_path || null,
    stacks: form.stacks.filter((s) => s.name && s.path).map((s) => ({
      name: s.name, path: s.path, versionInfo: versionInfoRowsToMap(s.versionInfo),
    })),
  };
}

function ServerForm({ form, setForm, editing }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setStack = (i, patch) => setForm((f) => ({ ...f, stacks: f.stacks.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const setVi = (i, j, k, v) => setStack(i, { versionInfo: form.stacks[i].versionInfo.map((r, idx) => (idx === j ? { ...r, [k]: v } : r)) });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Environment key" htmlFor="srv-env" hint={editing ? 'Fixed once created.' : 'Letters, digits, - or _ (e.g. stage, prod-eu).'}>
          <Input id="srv-env" className="h-10 font-mono" required disabled={editing} value={form.env_key} onChange={set('env_key')} />
        </Field>
        <Field label="Display name" htmlFor="srv-name">
          <Input id="srv-name" className="h-10" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Host" htmlFor="srv-host">
          <Input id="srv-host" className="h-10 font-mono" required value={form.host} onChange={set('host')} />
        </Field>
        <Field label="SSH username" htmlFor="srv-user">
          <Input id="srv-user" className="h-10 font-mono" required value={form.ssh_username} onChange={set('ssh_username')} />
        </Field>
        <Field label="Authentication" htmlFor="srv-auth">
          <NativeSelect id="srv-auth" value={form.auth_method} onChange={set('auth_method')}>
            <option value="password">Password</option>
            <option value="path">Key file path</option>
            <option value="paste">Paste key</option>
          </NativeSelect>
        </Field>
        {form.auth_method === 'password' && (
          <Field label="SSH password" htmlFor="srv-pass">
            <Input id="srv-pass" type="password" className="h-10" autoComplete="new-password" value={form.ssh_password} onChange={set('ssh_password')} />
          </Field>
        )}
        {form.auth_method === 'path' && (
          <Field label="Key path" htmlFor="srv-keypath">
            <Input id="srv-keypath" className="h-10 font-mono" placeholder="/root/.ssh/id_ed25519" value={form.ssh_key_path} onChange={set('ssh_key_path')} />
          </Field>
        )}
        {form.auth_method === 'paste' && (
          <Field label="Private key" htmlFor="srv-key" className="sm:col-span-2">
            <textarea id="srv-key" rows={6} className={textareaClass} value={form.ssh_key_content} onChange={set('ssh_key_content')} />
          </Field>
        )}
        {form.auth_method !== 'password' && (
          <Field label="Key passphrase" htmlFor="srv-passphrase">
            <Input id="srv-passphrase" type="password" className="h-10" autoComplete="new-password" value={form.ssh_passphrase} onChange={set('ssh_passphrase')} />
          </Field>
        )}
        <Field label="Docker Compose command" htmlFor="srv-compose">
          <Input id="srv-compose" className="h-10 font-mono" value={form.docker_compose_cmd} onChange={set('docker_compose_cmd')} />
        </Field>
        <Field label="AWS security group ID" htmlFor="srv-sg" hint="Optional — enables IP whitelisting.">
          <Input id="srv-sg" className="h-10 font-mono" placeholder="sg-…" value={form.aws_sg_id} onChange={set('aws_sg_id')} />
        </Field>
        <Field label="Maintenance flag path" htmlFor="srv-maint" hint="Optional — enables the maintenance toggle." className="sm:col-span-2">
          <Input id="srv-maint" className="h-10 font-mono" placeholder="/path/to/nginx/maintenance.flag" value={form.maintenance_flag_path} onChange={set('maintenance_flag_path')} />
        </Field>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Compose stacks</h3>
          <Button type="button" variant="outline" className="h-10" onClick={() => setForm((f) => ({ ...f, stacks: [...f.stacks, emptyStack()] }))}>
            <Plus className="size-4" /> Add stack
          </Button>
        </div>
        {form.stacks.map((st, i) => (
          <fieldset key={i} className="space-y-3 rounded-lg border p-3">
            <legend className="sr-only">Stack {i + 1}</legend>
            <div className="flex items-end gap-2">
              <Field label="Stack name" htmlFor={`stack-${i}-name`} className="w-1/3">
                <Input id={`stack-${i}-name`} className="h-10" placeholder="Main" value={st.name} onChange={(e) => setStack(i, { name: e.target.value })} />
              </Field>
              <Field label="Compose file path" htmlFor={`stack-${i}-path`} className="flex-1">
                <Input id={`stack-${i}-path`} className="h-10 font-mono" placeholder="/app/docker-compose.yml" value={st.path} onChange={(e) => setStack(i, { path: e.target.value })} />
              </Field>
              <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0" aria-label={`Remove stack ${st.name || i + 1}`} onClick={() => setForm((f) => ({ ...f, stacks: f.stacks.filter((_, idx) => idx !== i) }))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="space-y-2 rounded-md bg-muted/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Version info (optional) — where each service keeps its build metadata</span>
                <Button type="button" variant="ghost" className="h-10" onClick={() => setStack(i, { versionInfo: [...(st.versionInfo || []), { serviceName: '', path: '', format: 'properties' }] })}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              {(st.versionInfo || []).map((vi, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <Input aria-label="Service name" className="h-10 sm:w-36" placeholder="backend" value={vi.serviceName} onChange={(e) => setVi(i, j, 'serviceName', e.target.value)} />
                  <Input aria-label="Path in container" className="h-10 flex-1 font-mono" placeholder="/app/git.properties" value={vi.path} onChange={(e) => setVi(i, j, 'path', e.target.value)} />
                  <NativeSelect aria-label="Format" className="w-32" value={vi.format} onChange={(e) => setVi(i, j, 'format', e.target.value)}>
                    <option value="properties">properties</option>
                    <option value="json">json</option>
                  </NativeSelect>
                  <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Remove version info" onClick={() => setStack(i, { versionInfo: st.versionInfo.filter((_, idx) => idx !== j) })}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </>
  );
}

export default function ServersSection() {
  const runCommand = useRunCommand();
  const setEnabled = useSetServerEnabled();
  const q = useServers();
  const [editing, setEditing] = useState(null); // null | 'new' | server
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openAdd = () => { setEditing('new'); setForm({ ...EMPTY_FORM, stacks: [emptyStack()] }); setError(''); };
  const openEdit = (s) => { setEditing(s); setForm(serverToForm(s)); setError(''); };
  const close = () => setEditing(null);

  // Once an error shows, keep it in step with the form so a fixed field clears it.
  useEffect(() => {
    if (form) setError((current) => (current ? validateServer(form) : current));
  }, [form]);

  const save = async () => {
    const problem = validateServer(form);
    setError(problem);
    if (problem) return;
    const body = formToBody(form);
    const isNew = editing === 'new';
    setSaving(true);
    const r = await runCommand({
      pending: isNew ? `Adding ${body.env_key}…` : `Saving ${body.env_key}…`,
      success: isNew ? `${body.env_key} added` : `${body.env_key} saved`,
      failure: isNew ? 'Could not add the server' : 'Could not save the server',
      fn: () => (isNew ? createSettingsServer(body) : updateSettingsServer(editing.id, body)),
      invalidate: [qk.servers, ['containers']],
    });
    setSaving(false);
    if (r) close();
  };

  const remove = (s) =>
    runCommand({
      confirm: {
        title: `Remove ${s.env_key}?`,
        description: `Dockyard stops managing ${s.name || s.env_key} (${s.host}). Nothing on the server itself is changed.`,
        confirmLabel: 'Remove server',
        destructive: true,
        // Same rule as container actions (spec §6.1): PROD needs the env key typed.
        level: isProd(s.env_key) ? 'typed' : 'confirm',
        typedValue: s.env_key,
      },
      pending: `Removing ${s.env_key}…`,
      success: `${s.env_key} removed`,
      failure: `Could not remove ${s.env_key}`,
      fn: () => deleteSettingsServer(s.id),
      invalidate: [qk.servers],
    });

  const servers = q.data || [];
  return (
    <>
      <SectionHeader title="Servers" description="Each server is an environment: Dockyard connects over SSH and manages its Compose stacks.">
        <Button className="h-10" onClick={openAdd}><Plus className="size-4" /> Add server</Button>
      </SectionHeader>
      {q.isLoading ? <LoadingList /> : q.isError ? <LoadError what="servers" error={q.error} /> : servers.length === 0 ? (
        <EmptyNote>No servers yet. Add one to start managing its containers.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {servers.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-start gap-3">
                <div className={`min-w-0 flex-1 space-y-1.5 ${isServerEnabled(s) ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag className="uppercase">{s.env_key}</Tag>
                    <span className="font-medium">{s.name}</span>
                    {!isServerEnabled(s) && <Tag>Disabled</Tag>}
                    <span className="font-mono text-xs text-muted-foreground">{s.ssh_username}@{s.host}</span>
                  </div>
                  {s.stacks.length > 0 ? (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {s.stacks.map((st) => (
                        <li key={st.id ?? st.name} className="flex min-w-0 gap-2">
                          <span className="shrink-0 text-foreground">{st.name}</span>
                          <code className="truncate">{st.path}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-warn">No Compose stacks configured.</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Off: hidden everywhere and never contacted, settings kept. */}
                  <label className="flex h-10 cursor-pointer items-center px-2">
                    <Switch aria-label={`Enable ${s.env_key}`} checked={isServerEnabled(s)} onCheckedChange={(v) => setEnabled(s, v === true)} />
                  </label>
                  <Button variant="ghost" size="icon" className="size-10" aria-label={`Edit ${s.env_key}`} onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-10 text-bad hover:text-bad" aria-label={`Remove ${s.env_key}`} onClick={() => remove(s)}><Trash2 className="size-4" /></Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <FormSheet
        open={!!editing}
        onOpenChange={(o) => !o && close()}
        title={editing === 'new' ? 'Add server' : `Edit ${editing?.env_key ?? ''}`}
        onSubmit={save}
        saving={saving}
        error={error}
      >
        {form && <ServerForm form={form} setForm={setForm} editing={editing !== 'new'} />}
      </FormSheet>
    </>
  );
}
