import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge, Tag } from '@/components/status';
import { usePendingAction } from '@/lib/queries';
import { describeState } from '@/lib/containers';
import { describeAction } from '@/features/container/actions';
import { computeDrift } from '@/features/overview/drift';
import { EnvFixActions } from '@/features/overview/EnvFixActions';
import { setFocusedCell } from '@/features/overview/focusStore';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/ThemeProvider';

function EnvHeader({ env, state, error }) {
  if (state === 'unreachable' || state === 'stale') {
    return (
      <th scope="col" className="bg-bad-bg px-3.5 py-2 text-left text-xs font-medium text-bad">
        <Popover>
          <PopoverTrigger className="inline-flex items-center gap-1">
            {env.toUpperCase()} · unreachable <Info className="size-3.5" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-2 text-[13px]">
            <p className="font-medium">Can't reach {env}</p>
            <p className="font-mono text-xs break-words text-muted-foreground">{error}</p>
            <EnvFixActions env={env} />
          </PopoverContent>
        </Popover>
      </th>
    );
  }
  return (
    <th scope="col" className="bg-muted/50 px-3.5 py-2 text-left text-xs font-medium text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        {env.toUpperCase()}
        {state === 'loading' && <Skeleton className="h-3 w-10" />}
      </span>
    </th>
  );
}

function CellBody({ env, cell, drift, onPromote }) {
  const pending = usePendingAction(env, cell.kind === 'present' ? cell.container.name : '');
  if (cell.kind === 'unknown') return <span className="text-muted-foreground">—</span>;
  if (cell.kind === 'absent') return <span className="text-muted-foreground">not deployed</span>;

  const state = describeState(cell.container);
  const showDrift = drift && !cell.stale;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {state.tone !== 'ok' && <StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
      <Tag tone={showDrift ? 'warn' : undefined} className={cn(cell.stale && 'opacity-60')}>{cell.tag}</Tag>
      {cell.stale && <span className="text-[11px] text-muted-foreground">(stale)</span>}
      {cell.extra > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[11px] text-muted-foreground">+{cell.extra}</span>
          </TooltipTrigger>
          <TooltipContent>Also defined in {cell.extra} more stack{cell.extra > 1 ? 's' : ''}</TooltipContent>
        </Tooltip>
      )}
      {showDrift && (
        <button
          type="button"
          tabIndex={-1}
          className="text-[11px] text-primary opacity-0 group-hover:opacity-100 group-focus:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onPromote();
          }}
        >
          ↑ promote
        </button>
      )}
      {pending && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {describeAction(pending.action, { toTag: pending.body?.newTag }).pending}
        </span>
      )}
    </span>
  );
}

export function OverviewMatrix({ envs, rows, onOpen }) {
  const { density } = useTheme();
  const envOrder = envs.map((e) => e.env);
  const orderKey = envOrder.join('|');
  const drifts = useMemo(() => rows.map((row) => computeDrift(row, envOrder)), [rows, orderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const cellRefs = useRef(new Map());

  useEffect(() => {
    setFocus((f) => ({ r: Math.min(f.r, Math.max(rows.length - 1, 0)), c: Math.min(f.c, Math.max(envOrder.length - 1, 0)) }));
  }, [rows.length, envOrder.length]);

  const cellAt = (r, c) => rows[r]?.cells[envOrder[c]];

  const noteFocus = (r, c) => {
    setFocus({ r, c });
    const cell = cellAt(r, c);
    setFocusedCell(cell?.kind === 'present' ? { env: envOrder[c], containerName: cell.container.name, service: rows[r].service } : null);
  };

  const moveTo = (r, c) => {
    noteFocus(r, c);
    cellRefs.current.get(`${r}:${c}`)?.focus();
  };

  const open = (r, c, tab = 'deploy') => {
    const cell = cellAt(r, c);
    if (cell?.kind === 'present') onOpen(envOrder[c], cell.container.name, tab);
  };

  const promote = (r, c) => {
    const cell = cellAt(r, c);
    const drift = drifts[r]?.[envOrder[c]];
    if (cell?.kind === 'present' && drift && !cell.stale) onOpen(envOrder[c], cell.container.name, 'deploy', { prefillTag: drift.upstreamTag });
  };

  const onKeyDown = (e) => {
    const { r, c } = focus;
    const handlers = {
      ArrowDown: () => moveTo(Math.min(r + 1, rows.length - 1), c),
      ArrowUp: () => moveTo(Math.max(r - 1, 0), c),
      ArrowRight: () => moveTo(r, Math.min(c + 1, envOrder.length - 1)),
      ArrowLeft: () => moveTo(r, Math.max(c - 1, 0)),
      Enter: () => open(r, c, 'deploy'),
      l: () => open(r, c, 'logs'),
      p: () => promote(r, c),
    };
    const handler = handlers[e.key];
    if (!handler || e.target.tagName === 'INPUT') return;
    e.preventDefault();
    handler();
  };

  const rowHeight = density === 'compact' ? 'h-[30px]' : 'h-9';

  return (
    <table role="grid" aria-label="Deployments by environment" className="w-full border-collapse text-[13px]" onKeyDown={onKeyDown}>
      <thead>
        <tr className="border-b">
          <th scope="col" className="bg-muted/50 px-3.5 py-2 text-left text-xs font-medium text-muted-foreground">Service</th>
          {envs.map((e) => (
            <EnvHeader key={e.env} {...e} />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={row.service} className="border-b last:border-0">
            <th scope="row" className="px-3.5 text-left font-normal">
              {row.service}
              {!row.managed && <span className="ml-2 text-[11px] text-muted-foreground">unmanaged</span>}
            </th>
            {envOrder.map((env, c) => {
              const cell = row.cells[env];
              const drift = drifts[r]?.[env];
              const isFocus = focus.r === r && focus.c === c;
              return (
                <td
                  key={env}
                  role="gridcell"
                  ref={(el) => (el ? cellRefs.current.set(`${r}:${c}`, el) : cellRefs.current.delete(`${r}:${c}`))}
                  tabIndex={isFocus ? 0 : -1}
                  data-drift={drift && cell.kind === 'present' && !cell.stale ? 'true' : undefined}
                  className={cn(
                    'group px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    rowHeight,
                    cell.kind === 'present' && 'cursor-pointer hover:bg-accent/50',
                  )}
                  onFocus={() => noteFocus(r, c)}
                  onClick={() => open(r, c, 'deploy')}
                >
                  <CellBody env={env} cell={cell} drift={drift} onPromote={() => promote(r, c)} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
