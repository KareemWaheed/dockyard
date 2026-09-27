import { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRunAction } from '@/features/container/useRunAction';
import { ENV_KEY_RE, isSecretKey } from '@/features/container/maskEnv';
import { usePendingAction } from '@/lib/queries';

const MASK = '••••••';

export function EnvTab({ env, container }) {
  const run = useRunAction(env);
  const pending = usePendingAction(env, container.name);
  const editable = container.managed && !!container.stackPath;
  const vars = Object.entries(container.env || {}).sort(([a], [b]) => a.localeCompare(b));
  const [edits, setEdits] = useState({});
  const [added, setAdded] = useState([]);
  const [revealed, setRevealed] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const changes = [
    ...vars.filter(([k, v]) => k in edits && edits[k] !== v).map(([k]) => ({ key: k, value: edits[k] })),
    ...added.filter((a) => a.key).map((a) => ({ key: a.key, value: a.value })),
  ];
  const invalidNew = added.some((a) => a.key && !ENV_KEY_RE.test(a.key));
  const toggleReveal = (k) => setRevealed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const discard = () => { setEdits({}); setAdded([]); };

  const apply = async () => {
    setBusy(true);
    const ok = await run(container, 'update-env', { changes });
    setBusy(false);
    if (ok) discard();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pb-3">
        {vars.map(([key, value]) => {
          const secret = isSecretKey(key);
          const hidden = secret && !revealed.has(key);
          const current = key in edits ? edits[key] : value;
          const changed = key in edits && edits[key] !== value;
          return (
            <div key={key} className="grid grid-cols-[minmax(110px,38%)_1fr_auto] items-center gap-2">
              <span className="truncate font-mono text-xs text-muted-foreground" title={key}>{key}</span>
              {editable && !hidden ? (
                <Input aria-label={key} className={changed ? 'h-8 border-warn font-mono text-xs' : 'h-8 font-mono text-xs'} value={current} onChange={(e) => setEdits((s) => ({ ...s, [key]: e.target.value }))} />
              ) : (
                <span className="truncate font-mono text-xs" title={hidden ? undefined : current}>{hidden ? MASK : current || '—'}</span>
              )}
              {secret ? (
                <Button size="icon" variant="ghost" className="size-7" aria-label={`${hidden ? 'Reveal' : 'Hide'} ${key}`} onClick={() => toggleReveal(key)}>
                  {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </Button>
              ) : (
                <span className="size-7" />
              )}
            </div>
          );
        })}
        {editable && added.map((a, i) => (
          <div key={i} className="space-y-1">
            <div className="grid grid-cols-[minmax(110px,38%)_1fr_auto] items-center gap-2">
              <Input aria-label="New variable name" placeholder="KEY" className="h-8 border-warn font-mono text-xs" value={a.key} onChange={(e) => setAdded((l) => l.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
              <Input aria-label="New variable value" placeholder="value" className="h-8 border-warn font-mono text-xs" value={a.value} onChange={(e) => setAdded((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <Button size="icon" variant="ghost" className="size-7" aria-label="Remove new variable" onClick={() => setAdded((l) => l.filter((_, j) => j !== i))}><X className="size-3.5" /></Button>
            </div>
            {a.key && !ENV_KEY_RE.test(a.key) && <p className="text-xs text-bad">Letters, digits and _ only; must not start with a digit</p>}
          </div>
        ))}
        {editable && (
          <Button variant="ghost" size="sm" onClick={() => setAdded((l) => [...l, { key: '', value: '' }])}>+ Add variable</Button>
        )}
      </div>
      {editable && (
        <div className="sticky bottom-0 flex items-center gap-2 border-t bg-card pt-3">
          <Button disabled={changes.length === 0 || invalidNew || busy || !!pending} onClick={apply}>
            Apply {changes.length} change{changes.length === 1 ? '' : 's'}
          </Button>
          <Button variant="ghost" disabled={changes.length === 0 && added.length === 0} onClick={discard}>Discard</Button>
        </div>
      )}
    </div>
  );
}
