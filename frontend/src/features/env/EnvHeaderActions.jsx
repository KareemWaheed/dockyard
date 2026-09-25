import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDialogs } from '@/app/DialogProvider';
import { getMaintenance, setMaintenance } from '@/lib/api';
import { qk, useServers } from '@/lib/queries';
import { confirmPolicy, describeAction } from '@/features/container/actions';
import { EnvFixActions } from '@/features/overview/EnvFixActions';

export function EnvHeaderActions({ env }) {
  const qc = useQueryClient();
  const { confirm } = useDialogs();
  const { data: servers } = useServers();
  const server = servers?.find((s) => s.env_key === env);
  const [fixOpen, setFixOpen] = useState(false);
  const maintenance = useQuery({
    queryKey: qk.maintenance(env),
    queryFn: () => getMaintenance(env),
    enabled: !!server?.maintenance_flag_path,
  });

  const toggleMaintenance = async (next) => {
    const action = next ? 'maintenance-on' : 'maintenance-off';
    const text = describeAction(action, { env });
    const level = confirmPolicy(action, env);
    const res = await confirm({ ...text, level, typedValue: env, destructive: next });
    if (!res.ok) return;
    try {
      await setMaintenance(env, next);
      toast.success(text.success);
    } catch (err) {
      toast.error(`${text.title.replace(/\?$/, '')} failed`, { description: err.message, duration: Infinity });
    } finally {
      qc.invalidateQueries({ queryKey: qk.maintenance(env) });
    }
  };

  const fixLabel = server?.aws_sg_id ? 'Whitelist my IP…' : 'Restart FortiVPN…';

  return (
    <>
      {server?.maintenance_flag_path && maintenance.data && (
        <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
          <Switch id={`maint-${env}`} aria-label="Maintenance" checked={maintenance.data.enabled} onCheckedChange={toggleMaintenance} />
          <Label htmlFor={`maint-${env}`} className="text-[13px] font-normal">
            Maintenance {maintenance.data.enabled ? <span className="font-medium text-bad">on</span> : 'off'}
          </Label>
        </div>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" aria-label={`${env} actions`}><MoreHorizontal className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setFixOpen(true)}>{fixLabel}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => qc.refetchQueries({ queryKey: qk.containers(env) })}>Refresh</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={fixOpen} onOpenChange={setFixOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{fixLabel.replace('…', '')} · {env}</DialogTitle></DialogHeader>
          <EnvFixActions env={env} />
        </DialogContent>
      </Dialog>
    </>
  );
}
