import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addService } from '@/lib/api';
import { qk } from '@/lib/queries';

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const RESTART = ['always', 'unless-stopped', 'on-failure', 'no'];

export function AddServiceDialog({ env, stackIdx, stackName, existing, open, onOpenChange }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [restart, setRestart] = useState('always');
  const [ports, setPorts] = useState('');
  const [envText, setEnvText] = useState('');
  const [cloneFrom, setCloneFrom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadClone = (src) => {
    setCloneFrom(src);
    const c = existing.find((x) => x.name === src);
    if (!c) return;
    setImage(c.image || '');
    setEnvText(Object.entries(c.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!NAME_RE.test(name)) return setError('Service name: letters, digits, _ . - (must start with a letter or digit)');
    if (!image.trim()) return setError('Image is required');
    const environment = Object.fromEntries(
      envText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]).filter(([k]) => k),
    );
    const portList = ports.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
    setBusy(true);
    setError('');
    try {
      await addService(env, stackIdx, { name: name.trim(), image: image.trim(), ports: portList, environment, restart });
      toast.success(`${name} added to ${stackName} on ${env.toUpperCase()}`);
      qc.invalidateQueries({ queryKey: qk.containers(env) });
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader><DialogTitle>Add service to {stackName}</DialogTitle></DialogHeader>
          {existing.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="svc-clone">Start from an existing service (optional)</Label>
              <select id="svc-clone" className="h-8 w-full rounded-md border bg-card px-2 text-[13px]" value={cloneFrom} onChange={(e) => loadClone(e.target.value)}>
                <option value="">—</option>
                {existing.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="svc-name">Service name</Label><Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="svc-image">Image</Label><Input id="svc-image" placeholder="registry/name:tag" className="font-mono" value={image} onChange={(e) => setImage(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-restart">Restart policy</Label>
            <select id="svc-restart" className="h-8 w-full rounded-md border bg-card px-2 text-[13px]" value={restart} onChange={(e) => setRestart(e.target.value)}>
              {RESTART.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="svc-ports">Ports (host:container, comma separated)</Label><Input id="svc-ports" placeholder="8080:80" value={ports} onChange={(e) => setPorts(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-env">Environment (KEY=value per line)</Label>
            <textarea id="svc-env" rows={4} className="w-full rounded-md border bg-card p-2 font-mono text-xs" value={envText} onChange={(e) => setEnvText(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">The com.dockyard.managed=true label is added automatically.</p>
          {error && <p className="text-xs text-bad">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create service'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
