import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDialogs } from '@/app/DialogProvider';
import { flattenEnv } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { useAllEnvs, useContainerAction } from '@/lib/queries';
import { ACTIONS, confirmPolicy, describeAction } from '@/features/container/actions';
import { TagCombobox } from '@/features/container/TagCombobox';

export function BulkBar({ env, containers, onClear }) {
  const mutation = useContainerAction(env);
  const { confirm, showError } = useDialogs();
  const all = useAllEnvs();
  const [busy, setBusy] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const n = containers.length;

  const services = new Set(containers.map((c) => c.serviceName || c.name));
  const seen = new Set();
  const tagItems = all
    .filter((e) => e.env !== env && e.data)
    .flatMap((e) => flattenEnv(e.data).filter((c) => services.has(c.serviceName || c.name)).map((c) => ({ tag: imageTag(c.image), hint: `on ${e.env.toUpperCase()}`, source: 'env' })))
    .filter((i) => !seen.has(i.tag) && seen.add(i.tag));

  const runBulk = async (action, extraBody = {}) => {
    const def = ACTIONS[action];
    const text = describeAction(action, { service: `${n} containers`, env, toTag: extraBody.newTag });
    const level = confirmPolicy(action, env);
    if (level !== 'none') {
      const res = await confirm({ ...text, level, typedValue: env, destructive: !!def.destructive });
      if (!res.ok) return;
    }
    setBusy(true);
    const id = toast.loading(`${text.pending} 0/${n}`);
    const failures = [];
    for (const [i, container] of containers.entries()) {
      try {
        await mutation.mutateAsync({ container, action, endpoint: def.endpoint, body: { ...(def.body || {}), ...extraBody } });
      } catch (err) {
        failures.push({ name: container.name, message: err.message });
      }
      toast.loading(`${text.pending} ${i + 1}/${n}`, { id });
    }
    setBusy(false);
    if (failures.length === 0) {
      toast.success(`${action} done for ${n} containers on ${env.toUpperCase()}`, { id });
      onClear();
    } else {
      const details = failures.map((f) => `${f.name}: ${f.message}`).join('\n\n');
      toast.error(`${failures.length} of ${n} failed: ${failures.map((f) => f.name).join(', ')}`, {
        id,
        duration: Infinity,
        action: { label: 'Details', onClick: () => showError(`Bulk ${action} on ${env.toUpperCase()}`, details) },
      });
    }
  };

  return (
    <div role="region" aria-label="Bulk actions" className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg md:left-[calc(50%+7rem)]">
      <span className="text-[13px] font-medium">{n} selected</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk('restart')}>Restart</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk('pull-recreate')}>Pull &amp; recreate</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk('force-recreate')}>Force recreate</Button>
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild><Button size="sm" variant="outline" disabled={busy}>Set tag…</Button></PopoverTrigger>
        <PopoverContent className="w-80 p-2">
          <TagCombobox
            groups={tagItems.length ? [{ heading: 'Other environments', items: tagItems }] : []}
            onPick={(tag) => {
              setTagOpen(false);
              runBulk('deploy', { newTag: tag });
            }}
          />
        </PopoverContent>
      </Popover>
      <Button size="sm" variant="outline" className="text-bad" disabled={busy} onClick={() => runBulk('stop')}>Stop</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>Clear</Button>
    </div>
  );
}
