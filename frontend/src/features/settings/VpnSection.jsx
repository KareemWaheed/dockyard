import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, RefreshCw, RotateCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status';
import { getVpnStatus, vpnAction } from '@/lib/api';
import { useDialogs } from '@/app/DialogProvider';
import { Card, SectionHeader, settingsKeys } from '@/features/settings/ui';

const LABELS = { start: 'Starting…', stop: 'Stopping…', restart: 'Restarting…' };

export default function VpnSection() {
  const { confirm: askConfirm } = useDialogs();
  const q = useQuery({ queryKey: settingsKeys.vpn, queryFn: getVpnStatus, select: (d) => d.status });
  const [busy, setBusy] = useState(null);
  const [output, setOutput] = useState('');
  const [exitCode, setExitCode] = useState(null);

  const status = q.isError ? 'unknown' : q.data;
  const tone = status === 'active' ? 'ok' : !status || status === 'unknown' ? 'idle' : 'bad';

  const run = async (action) => {
    if (action === 'stop') {
      const res = await askConfirm({
        title: 'Stop FortiVPN?',
        description: 'VPN-gated environments will be unreachable from Dockyard until it is started again.',
        confirmLabel: 'Stop VPN',
        destructive: true,
      });
      if (!res.ok) return;
    }
    setBusy(action);
    setOutput('');
    setExitCode(null);
    try {
      await vpnAction(action, (chunk) => setOutput((o) => o + chunk), (code) => setExitCode(code));
    } catch (err) {
      setOutput((o) => `${o}${err.message}\n`);
      setExitCode(1);
    } finally {
      setBusy(null);
      setTimeout(() => q.refetch(), 1500);
    }
  };

  return (
    <>
      <SectionHeader
        title="FortiVPN"
        description="Controls the fortivpn service on the Dockyard host. Stop it to free the VPN for your own machine, then start it again when you're done."
      />
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <StatusBadge tone={tone}>{q.isLoading ? 'checking…' : status || 'unknown'}</StatusBadge>
          <Button variant="ghost" className="h-10" disabled={!!busy || q.isFetching} onClick={() => q.refetch()}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Button className="h-10" disabled={!!busy} onClick={() => run('start')}><Play className="size-4" /> {busy === 'start' ? LABELS.start : 'Start'}</Button>
          <Button variant="outline" className="h-10 text-bad hover:text-bad" disabled={!!busy} onClick={() => run('stop')}><Square className="size-4" /> {busy === 'stop' ? LABELS.stop : 'Stop'}</Button>
          <Button variant="outline" className="h-10 text-warn hover:text-warn" disabled={!!busy} onClick={() => run('restart')}><RotateCw className="size-4" /> {busy === 'restart' ? LABELS.restart : 'Restart'}</Button>
        </div>
        {(output || exitCode != null) && (
          <pre aria-label="VPN output" className="max-h-[40vh] overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {output}
            {exitCode != null && (
              <span className={exitCode === 0 ? 'text-ok' : 'text-bad'}>{`\n${exitCode === 0 ? '✓ Done' : `✗ Exited with code ${exitCode}`}`}</span>
            )}
          </pre>
        )}
      </Card>
    </>
  );
}
