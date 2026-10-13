import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportSettings, importSettings } from '@/lib/api';
import { useDialogs } from '@/app/DialogProvider';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { Card, SectionHeader } from '@/features/settings/ui';

export function downloadJson(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BackupSection() {
  const runCommand = useRunCommand();
  const { confirm: askConfirm, showError } = useDialogs();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(null);

  const doExport = async () => {
    setBusy('export');
    const data = await runCommand({
      pending: 'Exporting settings…',
      success: 'Settings exported',
      failure: 'Could not export settings',
      fn: exportSettings,
    });
    setBusy(null);
    if (data) downloadJson(data, `dockyard-settings-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      showError('Not a settings file', `${file.name} isn't valid JSON.`);
      return;
    }
    const res = await askConfirm({
      title: 'Replace all settings?',
      description: `Everything in Settings is replaced with the contents of ${file.name}. Consider exporting the current settings first.`,
      confirmLabel: 'Replace settings',
      destructive: true,
    });
    if (!res.ok) return;
    setBusy('import');
    const r = await runCommand({
      pending: 'Importing settings…',
      success: 'Settings imported',
      failure: 'Could not import settings',
      fn: async () => (await importSettings(payload)) ?? true,
    });
    setBusy(null);
    // Everything may have changed — refresh it all.
    if (r) qc.invalidateQueries();
  };

  return (
    <>
      <SectionHeader title="Backup & restore" description="Export every setting to a file, or restore a previously exported file." />
      <Card className="space-y-3">
        <p className="text-sm text-muted-foreground">The export contains credentials (SSH keys, tokens, passwords) — store it somewhere safe.</p>
        <div className="flex flex-wrap gap-2">
          <Button className="h-10" disabled={!!busy} onClick={doExport}><Download className="size-4" /> {busy === 'export' ? 'Exporting…' : 'Export settings'}</Button>
          <Button variant="outline" className="h-10" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {busy === 'import' ? 'Importing…' : 'Import settings'}
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" data-testid="import-file" onChange={onFile} />
      </Card>
    </>
  );
}
