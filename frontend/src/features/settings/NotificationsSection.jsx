import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/status';
import { createNotification, deleteNotification, fetchNotifications, testNotification, updateNotification } from '@/lib/api';
import { useEnvKeys } from '@/lib/queries';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { Card, EmptyNote, Field, FormSheet, LoadError, LoadingList, SectionHeader, SwitchField, settingsKeys } from '@/features/settings/ui';

const EMPTY_CONFIG = {
  email: { host: '', port: 587, secure: false, user: '', pass: '', from: '', to: '' },
  webhook: { url: '', headers: {} },
};

const parse = (json, fallback) => {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
};

export const toNotifier = (row) => ({ ...row, config: parse(row.config_json, {}), envs: parse(row.envs_json, null) });

const toBody = (n) => ({ type: n.type, label: n.label, config_json: n.config, enabled: n.enabled ? 1 : 0, envs_json: n.envs });

function NotifierForm({ form, setForm }) {
  const envKeys = useEnvKeys();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCfg = (k, v) => setForm((f) => ({ ...f, config: { ...f.config, [k]: v } }));
  const cfgInput = (k, props = {}) => (
    <Input id={`n-${k}`} className="h-10" value={form.config[k] ?? ''} onChange={(e) => setCfg(k, e.target.value)} {...props} />
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="n-type">
          <NativeSelect id="n-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, config: { ...EMPTY_CONFIG[e.target.value] } }))}>
            <option value="webhook">Webhook</option>
            <option value="email">Email</option>
          </NativeSelect>
        </Field>
        <Field label="Label" htmlFor="n-label">
          <Input id="n-label" className="h-10" required value={form.label} onChange={(e) => set('label', e.target.value)} />
        </Field>
        <Field label="Environments" htmlFor="n-envs" hint="Comma-separated. Leave blank to notify for every environment." className="sm:col-span-2">
          <Input id="n-envs" className="h-10" list="n-env-keys" placeholder={envKeys.join(', ') || 'dev, stage, prod'} value={form.envs} onChange={(e) => set('envs', e.target.value)} />
          <datalist id="n-env-keys">{envKeys.map((k) => <option key={k} value={k} />)}</datalist>
        </Field>
      </div>
      {form.type === 'webhook' ? (
        <div className="grid gap-4">
          <Field label="Webhook URL" htmlFor="n-url">{cfgInput('url', { type: 'url', required: true, className: 'h-10 font-mono' })}</Field>
          <Field label="Authorization header" htmlFor="n-auth" hint="Optional — sent as the Authorization header.">
            <Input id="n-auth" className="h-10 font-mono" autoComplete="off" value={form.config.headers?.Authorization || ''} onChange={(e) => setCfg('headers', e.target.value ? { Authorization: e.target.value } : {})} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SMTP host" htmlFor="n-host">{cfgInput('host', { required: true, className: 'h-10 font-mono' })}</Field>
          <Field label="Port" htmlFor="n-port">
            <Input id="n-port" type="number" className="h-10" value={form.config.port} onChange={(e) => setCfg('port', Number(e.target.value))} />
          </Field>
          <div className="sm:col-span-2">
            <SwitchField id="n-secure" label="Use TLS (port 465)" checked={!!form.config.secure} onCheckedChange={(v) => setCfg('secure', v)} />
          </div>
          <Field label="Username" htmlFor="n-user">{cfgInput('user', { autoComplete: 'off' })}</Field>
          <Field label="Password" htmlFor="n-pass">{cfgInput('pass', { type: 'password', autoComplete: 'new-password' })}</Field>
          <Field label="From" htmlFor="n-from">{cfgInput('from', { placeholder: 'dockyard@example.com' })}</Field>
          <Field label="To" htmlFor="n-to">{cfgInput('to', { placeholder: 'team@example.com' })}</Field>
        </div>
      )}
    </>
  );
}

export default function NotificationsSection() {
  const runCommand = useRunCommand();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: settingsKeys.notifications, queryFn: fetchNotifications, select: (rows) => rows.map(toNotifier) });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditing('new'); setForm({ type: 'webhook', label: '', enabled: true, envs: '', config: { ...EMPTY_CONFIG.webhook } }); };
  const openEdit = (n) => { setEditing(n); setForm({ type: n.type, label: n.label, enabled: !!n.enabled, envs: n.envs ? n.envs.join(', ') : '', config: n.config }); };
  const close = () => setEditing(null);

  const save = async () => {
    const envs = form.envs.split(',').map((s) => s.trim()).filter(Boolean);
    const body = toBody({ ...form, envs: envs.length ? envs : null });
    const isNew = editing === 'new';
    setSaving(true);
    const r = await runCommand({
      pending: 'Saving notifier…',
      success: `${form.label || 'Notifier'} saved`,
      failure: 'Could not save the notifier',
      fn: () => (isNew ? createNotification(body) : updateNotification(editing.id, body)),
      invalidate: [settingsKeys.notifications],
    });
    setSaving(false);
    if (r) close();
  };

  const toggle = async (n, enabled) => {
    // Optimistic: the switch flips at once, and the refetch settles it either way.
    qc.setQueryData(settingsKeys.notifications, (rows) => rows?.map((r) => (r.id === n.id ? { ...r, enabled: enabled ? 1 : 0 } : r)));
    await runCommand({
      pending: `${enabled ? 'Enabling' : 'Disabling'} ${n.label}…`,
      success: `${n.label} ${enabled ? 'enabled' : 'disabled'}`,
      failure: `Could not update ${n.label}`,
      fn: () => updateNotification(n.id, toBody({ ...n, enabled })),
      invalidate: [settingsKeys.notifications],
    });
  };

  const test = (n) =>
    runCommand({
      pending: `Sending a test to ${n.label}…`,
      success: `Test sent to ${n.label}`,
      failure: `Test to ${n.label} failed`,
      fn: () => testNotification(n.id),
    });

  const remove = (n) =>
    runCommand({
      confirm: { title: `Remove ${n.label}?`, description: 'It will stop receiving deploy notifications.', confirmLabel: 'Remove notifier', destructive: true },
      pending: `Removing ${n.label}…`,
      success: `${n.label} removed`,
      failure: `Could not remove ${n.label}`,
      fn: () => deleteNotification(n.id),
      invalidate: [settingsKeys.notifications],
    });

  const notifiers = q.data || [];
  return (
    <>
      <SectionHeader title="Notifications" description="Get told about deploys by webhook (Slack, Teams, …) or email.">
        <Button className="h-10" onClick={openAdd}><Plus className="size-4" /> Add notifier</Button>
      </SectionHeader>
      {q.isLoading ? <LoadingList /> : q.isError ? <LoadError what="notifiers" error={q.error} /> : notifiers.length === 0 ? (
        <EmptyNote>No notifiers yet.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {notifiers.map((n) => (
            <li key={n.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag>{n.type}</Tag>
                    <span className="font-medium">{n.label}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {n.envs?.length ? `Envs: ${n.envs.join(', ')}` : 'All environments'}
                    {' · '}
                    <span className="font-mono">{n.type === 'email' ? n.config.to : n.config.url}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch aria-label={`${n.label} enabled`} className="mr-2" checked={!!n.enabled} onCheckedChange={(v) => toggle(n, v)} />
                  <Button variant="ghost" size="icon" className="size-10" aria-label={`Send a test to ${n.label}`} onClick={() => test(n)}><Send className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-10" aria-label={`Edit ${n.label}`} onClick={() => openEdit(n)}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-10 text-bad hover:text-bad" aria-label={`Remove ${n.label}`} onClick={() => remove(n)}><Trash2 className="size-4" /></Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <FormSheet open={!!editing} onOpenChange={(o) => !o && close()} title={editing === 'new' ? 'Add notifier' : `Edit ${editing?.label ?? ''}`} onSubmit={save} saving={saving}>
        {form && <NotifierForm form={form} setForm={setForm} />}
      </FormSheet>
    </>
  );
}
