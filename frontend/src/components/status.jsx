import { cn } from '@/lib/utils';

export const toneText = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', idle: 'text-idle' };
export const toneBg = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  idle: 'bg-idle-bg text-idle',
};
const toneDot = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', idle: 'bg-idle' };

// Decorative; always pair with a text label (status is never color-only).
export function StatusDot({ tone = 'idle', className }) {
  return <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-full', toneDot[tone], className)} />;
}

export function StatusBadge({ tone = 'idle', children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', toneBg[tone], className)}>
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

export function Tag({ children, tone, className }) {
  return (
    <span className={cn('rounded-[5px] px-1.5 py-px font-mono text-[12.5px] whitespace-nowrap', tone ? toneBg[tone] : 'bg-muted', className)}>
      {children}
    </span>
  );
}
