import { Input } from '@/components/ui/input';
import { Card, Field, LoadError, LoadingList, SaveBar, SectionHeader, useConfigDraft } from '@/features/settings/ui';

const EMPTY = { description: '', region: '', accessKeyId: '', secretAccessKey: '' };

export default function AwsSection() {
  const { q, draft, setDraft, dirty, save, saving } = useConfigDraft('awsSg', {
    label: 'AWS settings',
    fromServer: (d) => ({ ...EMPTY, ...(d || {}) }),
  });
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <>
      <SectionHeader
        title="AWS security group"
        description="Credentials used to whitelist your IP in a server's security group. Set the security group ID per server in Servers."
      />
      {q.isError ? <LoadError what="AWS settings" error={q.error} /> : !draft ? <LoadingList /> : (
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name / description" htmlFor="aws-desc" hint="Used as the rule description in the security group.">
            <Input id="aws-desc" className="h-10" placeholder="e.g. Kareem" value={draft.description || ''} onChange={set('description')} />
          </Field>
          <Field label="Region" htmlFor="aws-region">
            <Input id="aws-region" className="h-10 font-mono" placeholder="eu-central-1" value={draft.region || ''} onChange={set('region')} />
          </Field>
          <Field label="Access key ID" htmlFor="aws-key">
            <Input id="aws-key" className="h-10 font-mono" autoComplete="off" value={draft.accessKeyId || ''} onChange={set('accessKeyId')} />
          </Field>
          <Field label="Secret access key" htmlFor="aws-secret">
            <Input id="aws-secret" type="password" className="h-10 font-mono" autoComplete="new-password" value={draft.secretAccessKey || ''} onChange={set('secretAccessKey')} />
          </Field>
        </Card>
      )}
      {draft && <SaveBar dirty={dirty} saving={saving} onSave={() => save()} />}
    </>
  );
}
