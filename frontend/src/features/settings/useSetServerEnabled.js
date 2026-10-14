import { setServerEnabled } from '@/lib/api';
import { qk } from '@/lib/queries';
import { useRunCommand } from '@/features/runs/useRunCommand';

// Switch a server on/off. Disabled servers stay configured but drop out of every polled view.
export function useSetServerEnabled() {
  const runCommand = useRunCommand();
  return (server, enabled) =>
    runCommand({
      pending: `${enabled ? 'Enabling' : 'Disabling'} ${server.env_key}…`,
      success: `${server.env_key} ${enabled ? 'enabled' : 'disabled'}`,
      failure: `Could not ${enabled ? 'enable' : 'disable'} ${server.env_key}`,
      fn: () => setServerEnabled(server.id, enabled),
      // Refreshing a just-disabled env's containers would only earn a 409; the servers refetch
      // drops it from polling instead.
      invalidate: enabled ? [qk.servers, qk.containers(server.env_key)] : [qk.servers],
    });
}
