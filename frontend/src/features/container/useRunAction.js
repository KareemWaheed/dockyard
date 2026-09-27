import { useCallback } from 'react';
import { toast } from 'sonner';
import { useDialogs } from '@/app/DialogProvider';
import { useContainerAction } from '@/lib/queries';
import { splitImage } from '@/lib/image';
import { ACTIONS, confirmPolicy, describeAction } from '@/features/container/actions';

// Runs one logical action on one container: confirmation per §6.1, toasts, Undo for deploys.
export function useRunAction(env) {
  const mutation = useContainerAction(env);
  const { confirm: ask, showError } = useDialogs();

  const run = useCallback(
    async function run(container, action, extraBody = {}) {
      const def = ACTIONS[action];
      const service = container.serviceName || container.name;
      const pinnedByDigest = (container.image || '').includes('@');
      const fromTag = container.image && !pinnedByDigest ? splitImage(container.image).tag : null;
      const toTag = extraBody.newTag;
      const text = describeAction(action, { service, env, fromTag, toTag });
      const level = confirmPolicy(action, env);
      const requirePassword = action === 'manage' || action === 'unmanage';
      let body = { ...(def.body || {}), ...extraBody };

      if (level !== 'none' || requirePassword) {
        const res = await ask({
          ...text,
          level: level === 'typed' ? 'typed' : 'confirm',
          typedValue: env,
          destructive: !!def.destructive,
          requirePassword,
        });
        if (!res.ok) return false;
        if (requirePassword) body = { ...body, password: res.password };
      }

      const toastId = toast.loading(`${service}: ${text.pending}`);
      try {
        await mutation.mutateAsync({ container, action, endpoint: def.endpoint, body });
        const canUndo = action === 'deploy' && fromTag && fromTag !== toTag;
        const deployed = canUndo ? { ...container, image: `${splitImage(container.image).repo}:${toTag}` } : null;
        toast.success(text.success, {
          id: toastId,
          action: canUndo ? { label: 'Undo', onClick: () => run(deployed, 'deploy', { newTag: fromTag }) } : undefined,
        });
        return true;
      } catch (err) {
        toast.error(`${text.title.replace(/\?$/, '')} failed`, {
          id: toastId,
          description: err.message.length > 140 ? `${err.message.slice(0, 140)}…` : err.message,
          duration: Infinity,
          action: { label: 'Details', onClick: () => showError(`${service} on ${env.toUpperCase()}`, err.message) },
        });
        return false;
      }
    },
    [mutation, ask, showError, env],
  );

  return run;
}
