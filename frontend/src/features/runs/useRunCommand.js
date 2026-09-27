import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDialogs } from '@/app/DialogProvider';

const short = (msg) => (msg.length > 140 ? `${msg.slice(0, 140)}…` : msg);

// Build/flyway commands: optional confirmation → loading toast → success/error toast → invalidate.
export function useRunCommand() {
  const qc = useQueryClient();
  const { confirm: askConfirm, showError } = useDialogs();

  return useCallback(
    async ({ confirm: ask, pending, success, failure, fn, invalidate = [], onError }) => {
      if (ask) {
        const res = await askConfirm(ask);
        if (!res.ok) return null;
      }
      const id = toast.loading(pending);
      try {
        const result = await fn();
        toast.success(typeof success === 'function' ? success(result) : success, { id });
        return result;
      } catch (err) {
        toast.error(failure, {
          id,
          description: short(err.message),
          duration: Infinity,
          action: { label: 'Details', onClick: () => showError(failure, err.message) },
        });
        onError?.(err);
        return null;
      } finally {
        invalidate.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      }
    },
    [qc, askConfirm, showError],
  );
}
