// Logical action → backend endpoint. Every container action in the UI goes through this table.
export const ACTIONS = {
  deploy: { endpoint: 'update-tag' },
  restart: { endpoint: 'restart' },
  'pull-recreate': { endpoint: 'pull-recreate' },
  start: { endpoint: 'up' },
  'force-recreate': { endpoint: 'up', body: { forceRecreate: true }, destructive: true },
  stop: { endpoint: 'stop', destructive: true },
  'update-env': { endpoint: 'update-env' },
  manage: { endpoint: 'toggle-managed', body: { enabled: true } },
  unmanage: { endpoint: 'toggle-managed', body: { enabled: false }, destructive: true },
};

export function isProd(env) {
  return /^prod/i.test(env || '');
}

const ROUTINE = new Set(['deploy', 'restart', 'pull-recreate', 'start', 'update-env']);
const RISKY = new Set(['stop', 'force-recreate', 'maintenance-on', 'unmanage']);
const ALWAYS_CONFIRM = new Set(['maintenance-off', 'manage']);

// Spec §6.1: friction scales with risk and with PROD.
export function confirmPolicy(action, env) {
  const prod = isProd(env);
  if (ROUTINE.has(action)) return prod ? 'confirm' : 'none';
  if (RISKY.has(action)) return prod ? 'typed' : 'confirm';
  if (ALWAYS_CONFIRM.has(action)) return 'confirm';
  throw new Error(`Unknown action: ${action}`);
}

export function describeAction(action, { service, env, fromTag, toTag } = {}) {
  const ENV = (env || '').toUpperCase();
  const on = `${service} on ${ENV}`;
  switch (action) {
    case 'deploy':
      return { title: `Deploy ${service} to ${ENV}?`, description: `${fromTag ?? 'unknown'} → ${toTag}. The container is recreated with the new image.`, confirmLabel: `Deploy to ${ENV}`, pending: `deploying ${toTag}…`, success: `${on} → ${toTag}` };
    case 'restart':
      return { title: `Restart ${on}?`, description: 'The container restarts with its current image and settings.', confirmLabel: 'Restart', pending: 'restarting…', success: `${on} restarted` };
    case 'pull-recreate':
      return { title: `Pull and recreate ${on}?`, description: 'Pulls the current tag again and recreates the container.', confirmLabel: 'Pull & recreate', pending: 'pulling…', success: `${on} recreated from a fresh pull` };
    case 'start':
      return { title: `Start ${on}?`, description: 'Runs docker compose up for this service.', confirmLabel: 'Start', pending: 'starting…', success: `${on} started` };
    case 'force-recreate':
      return { title: `Force recreate ${on}?`, description: 'The container is destroyed and recreated from the image already on the server. Expect a few seconds of downtime.', confirmLabel: 'Force recreate', pending: 'recreating…', success: `${on} recreated` };
    case 'stop':
      return { title: `Stop ${on}?`, description: 'The container will be stopped until you start it again.', confirmLabel: 'Stop', pending: 'stopping…', success: `${on} stopped` };
    case 'update-env':
      return { title: `Apply env changes to ${on}?`, description: 'The container is recreated once with the new values.', confirmLabel: 'Apply', pending: 'applying env…', success: `${on} env updated` };
    case 'manage':
      return { title: `Manage ${on}?`, description: 'Adds the com.dockyard.managed label and recreates the container.', confirmLabel: 'Manage', pending: 'updating label…', success: `${on} is now managed` };
    case 'unmanage':
      return { title: `Unmanage ${on}?`, description: 'Removes the com.dockyard.managed label and recreates the container. Dockyard will stop offering actions for it.', confirmLabel: 'Unmanage', pending: 'updating label…', success: `${on} is no longer managed` };
    case 'maintenance-on':
      return { title: `Enable maintenance mode on ${ENV}?`, description: 'Creates the maintenance flag file on the server.', confirmLabel: 'Enable maintenance', pending: 'enabling maintenance…', success: `Maintenance on for ${ENV}` };
    case 'maintenance-off':
      return { title: `Disable maintenance mode on ${ENV}?`, description: 'Removes the maintenance flag file from the server.', confirmLabel: 'Disable maintenance', pending: 'disabling maintenance…', success: `Maintenance off for ${ENV}` };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
