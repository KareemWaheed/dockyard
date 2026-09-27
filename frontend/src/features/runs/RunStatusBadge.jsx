import { StatusBadge } from '@/components/status';
import { runStatusMeta } from '@/features/runs/runStatus';

export function RunStatusBadge({ status, className }) {
  const { tone, label } = runStatusMeta(status);
  return <StatusBadge tone={tone} className={className}>{label}</StatusBadge>;
}
