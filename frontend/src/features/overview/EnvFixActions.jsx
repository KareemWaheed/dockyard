import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { restartVpn, whitelistIp } from '@/lib/api';
import { qk, useServers } from '@/lib/queries';

// Fixes for an unreachable env: AWS envs whitelist the caller's IP, others restart FortiVPN.
export function EnvFixActions({ env }) {
  const { data: servers } = useServers();
  const server = servers?.find((s) => s.env_key === env);
  const qc = useQueryClient();
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const retry = () => qc.refetchQueries({ queryKey: qk.containers(env) });

  const run = async (fn) => {
    setRunning(true);
    setOutput('');
    await fn(
      (chunk) => setOutput((o) => o + chunk),
      (code) => {
        setRunning(false);
        if (code === 0) setTimeout(retry, 2000);
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {server?.aws_sg_id ? (
          <Button size="sm" disabled={running} onClick={() => run((onChunk, onDone) => whitelistIp(env, onChunk, onDone))}>
            {running ? 'Whitelisting…' : 'Whitelist my IP'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={running} onClick={() => run(restartVpn)}>
            {running ? 'Restarting…' : 'Restart FortiVPN'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={retry}>Retry</Button>
      </div>
      {output && <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">{output}</pre>}
    </div>
  );
}
