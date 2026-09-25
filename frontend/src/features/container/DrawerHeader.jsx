import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge, Tag } from '@/components/status';
import { saveNote } from '@/lib/api';
import { describeState } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { qk } from '@/lib/queries';
import { useRunAction } from '@/features/container/useRunAction';

export function DrawerHeader({ env, container, onClose }) {
  const qc = useQueryClient();
  const run = useRunAction(env);
  const [note, setNote] = useState(container.note || '');
  const state = describeState(container);
  const service = container.serviceName || container.name;

  const commitNote = async () => {
    if (note === (container.note || '')) return;
    await saveNote(env, container.name, note);
    qc.invalidateQueries({ queryKey: qk.containers(env) });
  };

  return (
    <div className="space-y-3 border-b px-4 pt-4 pb-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{service}</h2>
          <p className="text-xs text-muted-foreground">
            {env.toUpperCase()}
            {container.stackName ? ` · ${container.stackName}` : ' · standalone'}
          </p>
        </div>
        {!container.managed && container.stackPath && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => run(container, 'manage')}>Manage…</Button>
        )}
        <Button size="icon" variant="ghost" className={container.managed || !container.stackPath ? 'ml-auto' : ''} aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={state.tone}>{state.detail}</StatusBadge>
        <Tag>{imageTag(container.image)}</Tag>
        {(container.restartCount ?? 0) > 0 && <span className="text-xs text-warn">{container.restartCount} restarts</span>}
      </div>
      <Input
        aria-label="Note"
        placeholder="Add a note (branch, release, why)…"
        className="h-8"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commitNote}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}
