import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Field, LoadError, LoadingList, SaveBar, SectionHeader, useConfigDraft } from '@/features/settings/ui';

// Server shape: { token, baseUrl, projects: { name: repoPath } }; edited as rows.
const fromServer = (d) => ({
  token: d?.token || '',
  baseUrl: d?.baseUrl || '',
  rows: Object.entries(d?.projects || {}).map(([name, repo]) => ({ name, repo })),
});
const toServer = ({ rows, ...rest }) => ({
  ...rest,
  projects: Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.repo.trim()])),
});

export default function GitLabSection() {
  const { q, draft, setDraft, dirty, save, saving } = useConfigDraft('gitlab', { label: 'GitLab settings', fromServer, toServer });
  const setRow = (i, k, v) => setDraft((d) => ({ ...d, rows: d.rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)) }));

  return (
    <>
      <SectionHeader title="GitLab" description="API access used to look up tags and pipelines for your projects." />
      {q.isError ? <LoadError what="GitLab settings" error={q.error} /> : !draft ? <LoadingList /> : (
        <div className="space-y-4">
          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label="Base URL" htmlFor="gl-url">
              <Input id="gl-url" className="h-10 font-mono" placeholder="https://gitlab.example.com" value={draft.baseUrl} onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))} />
            </Field>
            <Field label="Access token" htmlFor="gl-token">
              <Input id="gl-token" type="password" className="h-10 font-mono" autoComplete="new-password" value={draft.token} onChange={(e) => setDraft((d) => ({ ...d, token: e.target.value }))} />
            </Field>
          </Card>
          <Card>
            <h3 className="mb-1 text-sm font-semibold">Projects</h3>
            <p className="mb-3 text-xs text-muted-foreground">Map a project name to its repository path on GitLab.</p>
            <ul className="space-y-2">
              {draft.rows.map((row, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input aria-label={`Project ${i + 1} name`} className="h-10" placeholder="Project name" value={row.name} onChange={(e) => setRow(i, 'name', e.target.value)} />
                  <Input aria-label={`Project ${i + 1} repository path`} className="h-10 font-mono" placeholder="group/repo" value={row.repo} onChange={(e) => setRow(i, 'repo', e.target.value)} />
                  <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label={`Remove project ${row.name || i + 1}`} onClick={() => setDraft((d) => ({ ...d, rows: d.rows.filter((_, idx) => idx !== i) }))}>
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-3 h-10" onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, { name: '', repo: '' }] }))}>
              <Plus className="size-4" /> Add project
            </Button>
          </Card>
        </div>
      )}
      {draft && <SaveBar dirty={dirty} saving={saving} onSave={() => save()} />}
    </>
  );
}
