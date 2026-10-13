import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { fetchProjectRemote, updateProjectRemote } from '@/lib/api';
import { qk } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useDialogs } from '@/app/DialogProvider';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { Card, EmptyNote, Field, LoadError, LoadingList, SaveBar, SectionHeader, SwitchField, settingsKeys, useConfigDraft } from '@/features/settings/ui';

const PARAM_TYPES = ['string', 'select', 'checkbox', 'multiselect'];
const emptyParam = () => ({ name: '', label: '', type: 'string', flag: '', required: false, default: '', placeholder: '', options: [] });

export const parseList = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

export function projectKey(name, existing) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'project';
  let key = slug;
  for (let i = 1; existing[key]; i++) key = `${slug}_${i}`;
  return key;
}

// Comma-separated list input that keeps what's typed (trailing commas included) while editing.
function ListInput({ value, onChange, ...props }) {
  const [text, setText] = useState(() => (value || []).join(', '));
  useEffect(() => {
    if (parseList(text).join('\u0000') !== (value || []).join('\u0000')) setText((value || []).join(', '));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Input {...props} value={text} onChange={(e) => { setText(e.target.value); onChange(parseList(e.target.value)); }} />;
}

function ParamCard({ p, i, count, update, move, remove }) {
  const id = (f) => `param-${i}-${f}`;
  const multi = p.type === 'multiselect';
  return (
    <li className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
        <span className="truncate text-sm font-medium">{p.label || p.name || 'New parameter'}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" className="size-9" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-9" aria-label="Move down" disabled={i === count - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-9 text-bad hover:text-bad" aria-label={`Remove ${p.label || p.name || 'parameter'}`} onClick={() => remove(i)}><Trash2 className="size-4" /></Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Key" htmlFor={id('name')}><Input id={id('name')} className="h-10 font-mono" value={p.name} onChange={(e) => update(i, 'name', e.target.value)} /></Field>
        <Field label="Label" htmlFor={id('label')}><Input id={id('label')} className="h-10" value={p.label} onChange={(e) => update(i, 'label', e.target.value)} /></Field>
        <Field label="Type" htmlFor={id('type')}>
          <NativeSelect id={id('type')} value={p.type} onChange={(e) => update(i, 'type', e.target.value)}>
            {PARAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Flag" htmlFor={id('flag')}><Input id={id('flag')} className="h-10 font-mono" placeholder="-tag" value={p.flag} onChange={(e) => update(i, 'flag', e.target.value)} /></Field>
        <Field label={multi ? 'Default (comma-separated)' : 'Default'} htmlFor={id('default')}>
          {multi ? (
            <ListInput id={id('default')} className="h-10" value={Array.isArray(p.default) ? p.default : []} onChange={(v) => update(i, 'default', v)} />
          ) : (
            <Input id={id('default')} className="h-10" value={Array.isArray(p.default) ? p.default.join(', ') : p.default ?? ''} onChange={(e) => update(i, 'default', e.target.value)} />
          )}
        </Field>
        <Field label="Placeholder" htmlFor={id('placeholder')}><Input id={id('placeholder')} className="h-10" value={p.placeholder || ''} onChange={(e) => update(i, 'placeholder', e.target.value)} /></Field>
        {(p.type === 'select' || multi) && (
          <Field label="Options (comma-separated)" htmlFor={id('options')} className="sm:col-span-2">
            <ListInput id={id('options')} className="h-10" value={p.options || []} onChange={(v) => update(i, 'options', v)} />
          </Field>
        )}
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Checkbox id={id('required')} checked={!!p.required} onCheckedChange={(v) => update(i, 'required', v === true)} />
          <Label htmlFor={id('required')}>Required</Label>
        </div>
      </div>
    </li>
  );
}

function RemoteStatus({ projectKey: key, repo, saved }) {
  const runCommand = useRunCommand();
  const q = useQuery({ queryKey: settingsKeys.projectRemote(key), queryFn: () => fetchProjectRemote(key), enabled: saved, retry: false });
  if (!saved || !q.data) return null;
  const info = q.data;
  const differs = info.isCloned && info.diskRemoteUrl && repo && info.diskRemoteUrl !== repo;
  const sync = () =>
    runCommand({
      pending: 'Updating the cloned repository…',
      success: 'Remote URL synced to the cloned repository',
      failure: 'Could not sync the remote URL',
      fn: () => updateProjectRemote(key, repo),
      invalidate: [settingsKeys.projectRemote(key)],
    });
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs sm:col-span-2 lg:col-span-3', differs && 'border-warn/50 bg-warn-bg')}>
      <span className="text-muted-foreground">Cloned remote on server:</span>
      {info.isCloned ? <code className="break-all">{info.diskRemoteUrl || '(none)'}</code> : <span className="text-muted-foreground">not cloned yet</span>}
      {differs && <span className="inline-flex items-center gap-1 text-warn"><AlertTriangle className="size-3.5" aria-hidden="true" /> differs from the saved URL</span>}
      {info.isCloned && (
        <Button variant="outline" size="sm" className="ml-auto" disabled={!repo} onClick={sync}>
          <RefreshCw className="size-3.5" /> Sync URL to server repo
        </Button>
      )}
    </div>
  );
}

export default function BuildProjectsSection() {
  const { confirm: askConfirm } = useDialogs();
  const { q, draft, setDraft, dirty, save, saving } = useConfigDraft('projects', { label: 'Build projects', fromServer: (d) => d || {} });
  const [active, setActive] = useState(null);
  const [newName, setNewName] = useState('');
  const keys = Object.keys(draft || {});

  useEffect(() => {
    if (draft && (!active || !draft[active])) setActive(Object.keys(draft)[0] ?? null);
  }, [draft, active]);

  const proj = active ? draft?.[active] : null;
  const savedKeys = q.data || {};
  const invalidate = [qk.buildProjects];

  const update = (field, value) => setDraft((d) => ({ ...d, [active]: { ...d[active], [field]: value } }));
  const params = proj?.params || [];
  const setParams = (next) => update('params', next);
  const updateParam = (i, field, value) => setParams(params.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  const moveParam = (i, dir) => {
    const next = [...params];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setParams(next);
  };

  const addProject = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const key = projectKey(name, draft);
    setDraft((d) => ({ ...d, [key]: { name, repo: '', buildScript: '', params: [] } }));
    setActive(key);
    setNewName('');
  };

  const removeProject = async () => {
    const label = proj.name || active;
    const res = await askConfirm({
      title: `Delete ${label}?`,
      description: `Removes the project from Dockyard${dirty ? ' and saves your other unsaved changes' : ''}. Its build history and the cloned repository on the server stay.`,
      confirmLabel: 'Delete project',
      destructive: true,
    });
    if (!res.ok) return;
    const next = { ...draft };
    delete next[active];
    await save(next, { invalidate, success: `${label} deleted` });
  };

  return (
    <>
      <SectionHeader title="Build projects" description="Repositories Dockyard can clone and build, and the parameters shown in the build form." />
      {q.isError ? <LoadError what="build projects" error={q.error} /> : !draft ? <LoadingList /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Projects">
            {keys.map((k) => (
              <Button key={k} variant={k === active ? 'default' : 'outline'} size="sm" className="h-9" aria-pressed={k === active} onClick={() => setActive(k)}>
                {draft[k].name || k}
              </Button>
            ))}
            <form onSubmit={addProject} className="flex gap-1">
              <Input aria-label="New project name" className="h-9 w-44" placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button type="submit" variant="outline" size="icon" className="size-9" aria-label="Add project" disabled={!newName.trim()}><Plus className="size-4" /></Button>
            </form>
          </div>

          {!proj ? (
            <EmptyNote>No build projects yet. Name one above to add it.</EmptyNote>
          ) : (
            <>
              <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Display name" htmlFor="bp-name"><Input id="bp-name" className="h-10" value={proj.name || ''} onChange={(e) => update('name', e.target.value)} /></Field>
                <Field label="Repository URL" htmlFor="bp-repo"><Input id="bp-repo" className="h-10 font-mono" value={proj.repo || ''} onChange={(e) => update('repo', e.target.value)} /></Field>
                <Field label="Build script" htmlFor="bp-script"><Input id="bp-script" className="h-10 font-mono" placeholder="build.sh" value={proj.buildScript || ''} onChange={(e) => update('buildScript', e.target.value)} /></Field>
                <RemoteStatus key={active} projectKey={active} repo={proj.repo} saved={!!savedKeys[active]} />
                <div className="space-y-3 sm:col-span-2 lg:col-span-3">
                  <SwitchField id="bp-flyway" label="Flyway project" hint="Lets Migrations run Flyway from this repository." checked={!!proj.isFlyway} onCheckedChange={(v) => update('isFlyway', v)} />
                  {proj.isFlyway && (
                    <Field label="Flyway path" htmlFor="bp-flyway-path" hint="Subdirectory that holds the Maven project." className="max-w-md">
                      <Input id="bp-flyway-path" className="h-10 font-mono" placeholder="services/api" value={proj.flywayPath || ''} onChange={(e) => update('flywayPath', e.target.value)} />
                    </Field>
                  )}
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button variant="outline" className="h-10 text-bad hover:text-bad" onClick={removeProject}><Trash2 className="size-4" /> Delete project</Button>
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold">Parameters</h3>
                <p className="mb-3 text-xs text-muted-foreground">Shown as fields in the build form and passed to the build script as flags.</p>
                {params.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {params.map((p, i) => (
                      <ParamCard key={i} p={p} i={i} count={params.length} update={updateParam} move={moveParam} remove={(idx) => setParams(params.filter((_, j) => j !== idx))} />
                    ))}
                  </ul>
                )}
                <Button variant="outline" className="h-10" onClick={() => setParams([...params, emptyParam()])}><Plus className="size-4" /> Add parameter</Button>
              </Card>
            </>
          )}
        </div>
      )}
      {draft && <SaveBar dirty={dirty} saving={saving} onSave={() => save(draft, { invalidate })} />}
    </>
  );
}
