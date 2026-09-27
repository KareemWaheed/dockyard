import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { deployRunToCapRover } from '@/lib/api';
import { qk } from '@/lib/queries';
import { usePref } from '@/lib/storage';
import { isProd } from '@/features/container/actions';
import { parseJsonArray } from '@/features/builds/buildArgs';
import { useRunCommand } from '@/features/runs/useRunCommand';

export function DeployBar({ project, run, status, targets, onDeployed }) {
  const runCommand = useRunCommand();
  const [targetId, setTargetId] = usePref(`builds.deployTarget.${project}`, '');
  const [image, setImage] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const images = parseJsonArray(run.pushed_images_json);
  const projectTargets = (targets || []).filter((t) => t.project === project);
  if (run.type !== 'build' || status !== 'success' || images.length === 0 || projectTargets.length === 0) return null;

  const target = projectTargets.find((t) => String(t.id) === String(targetId));
  const chosen = image || (images.length === 1 ? images[0] : '');
  const label = target ? target.name || target.env_key : '';

  const deploy = async () => {
    setError(null);
    setBusy(true);
    const result = await runCommand({
      confirm: {
        title: `Deploy #${run.build_number} to ${label}?`,
        description: `${chosen} → CapRover app ${target.app_name}.`,
        confirmLabel: `Deploy to ${label}`,
        level: isProd(target.env_key) ? 'typed' : 'confirm',
        typedValue: target.app_name,
      },
      pending: `Deploying #${run.build_number} to ${label}…`,
      success: (r) => `Deploy #${r.buildNumber} to ${label} started`,
      failure: `Deploy to ${label} failed`,
      fn: () => deployRunToCapRover(project, run.build_number, target.id, chosen),
      invalidate: [qk.buildRuns(project)],
      onError: (err) => setError(err.message),
    });
    setBusy(false);
    if (result) onDeployed(result.buildNumber);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-ok-bg/50 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <span className="flex items-center gap-1.5 text-sm font-medium text-ok"><Rocket className="size-4" aria-hidden="true" /> Deploy to CapRover</span>
      <NativeSelect aria-label="CapRover target" className="sm:w-56" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
        <option value="">Choose target…</option>
        {projectTargets.map((t) => (
          <option key={t.id} value={String(t.id)}>{(t.name || t.env_key)} → {t.app_name}</option>
        ))}
      </NativeSelect>
      {images.length > 1 && (
        <NativeSelect aria-label="Image" className="min-w-0 sm:max-w-80 sm:flex-1" value={image} onChange={(e) => setImage(e.target.value)}>
          <option value="">Choose image…</option>
          {images.map((im) => <option key={im} value={im}>{im}</option>)}
        </NativeSelect>
      )}
      <Button className="h-10 sm:ml-auto" disabled={busy || !target || !chosen} onClick={deploy}>Deploy</Button>
      {error && <p role="alert" className="w-full text-xs text-bad">{error}</p>}
    </div>
  );
}
