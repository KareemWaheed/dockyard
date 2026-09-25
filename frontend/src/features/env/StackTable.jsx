import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusDot, Tag, toneText } from '@/components/status';
import { describeState } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { usePendingAction } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/ThemeProvider';
import { describeAction } from '@/features/container/actions';

function Row({ env, c, active, onOpen, selectable, selected, onToggleSelect, muted }) {
  const { density } = useTheme();
  const state = describeState(c);
  const pending = usePendingAction(env, c.name);
  return (
    <tr
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'cursor-pointer border-b outline-none last:border-0 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        density === 'compact' ? 'h-[30px]' : 'h-9',
        active && 'bg-accent',
        muted && 'text-muted-foreground',
      )}
      onClick={() => onOpen(c.name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(c.name);
      }}
    >
      <td className="w-9 pl-3.5" onClick={(e) => e.stopPropagation()}>
        {selectable && c.managed && (
          <Checkbox aria-label={`Select ${c.name}`} checked={selected} onCheckedChange={() => onToggleSelect(c.name)} />
        )}
      </td>
      <td className="pr-3">
        <span className="flex items-center gap-2">
          <StatusDot tone={state.tone} />
          <span>{c.name}</span>
        </span>
      </td>
      <td className="pr-3"><Tag>{imageTag(c.image)}</Tag></td>
      <td className={cn('pr-3 text-xs', state.tone === 'ok' ? 'text-muted-foreground' : toneText[state.tone])}>
        {pending ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {describeAction(pending.action, { toTag: pending.body?.newTag }).pending}
          </span>
        ) : (
          state.detail
        )}
      </td>
      <td className="max-w-[260px] truncate pr-3.5 text-xs text-muted-foreground" title={c.note || undefined}>
        {c.note || '—'}
      </td>
    </tr>
  );
}

export function StackTable({ env, title, subtitle, containers, activeName, onOpen, selectable = false, selected, onToggleSelect, headerRight }) {
  const [showUnmanaged, setShowUnmanaged] = useState(false);
  const managed = containers.filter((c) => c.managed);
  const unmanaged = containers.filter((c) => !c.managed);
  const rowProps = { env, onOpen, selectable, onToggleSelect };

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        <div className="ml-auto">{headerRight}</div>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {managed.map((c) => (
            <Row key={c.name} c={c} active={activeName === c.name} selected={selected?.has(c.name) ?? false} {...rowProps} />
          ))}
          {unmanaged.length > 0 && (
            <tr className="border-t">
              <td colSpan={5} className="px-3.5 py-2">
                <button
                  type="button"
                  aria-expanded={showUnmanaged}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowUnmanaged((v) => !v)}
                >
                  <ChevronRight className={cn('size-3.5 transition-transform', showUnmanaged && 'rotate-90')} aria-hidden="true" />
                  {unmanaged.length} unmanaged ({unmanaged.slice(0, 4).map((c) => c.name).join(', ')}{unmanaged.length > 4 ? ', …' : ''})
                </button>
              </td>
            </tr>
          )}
          {showUnmanaged && unmanaged.map((c) => (
            <Row key={c.name} c={c} active={activeName === c.name} selected={false} muted {...rowProps} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
