import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Download, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useLogStream } from '@/features/container/useLogStream';
import { useDrawerExpanded } from '@/features/container/ContainerDrawer';

function Highlighted({ text, term }) {
  if (!term) return text;
  const lower = text.toLowerCase();
  const out = [];
  let from = 0;
  let at = lower.indexOf(term);
  while (at !== -1) {
    out.push(text.slice(from, at), <mark key={at} className="rounded-sm bg-warn-bg text-warn">{text.slice(at, at + term.length)}</mark>);
    from = at + term.length;
    at = lower.indexOf(term, from);
  }
  out.push(text.slice(from));
  return out;
}

export function LogsTab({ env, container }) {
  const { lines, status, reconnect } = useLogStream(env, container.name);
  const [expanded, setExpanded] = useDrawerExpanded();
  const [search, setSearch] = useState('');
  const [matchesOnly, setMatchesOnly] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [follow, setFollow] = useState(true);
  const bodyRef = useRef(null);
  const term = search.trim().toLowerCase();
  const shown = term && matchesOnly ? lines.filter((l) => l.toLowerCase().includes(term)) : lines;

  useEffect(() => {
    if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    // `lines` (not shown.length): once the 5,000-line cap is hit, its length
    // stops changing even though new lines keep arriving (oldest evicted) —
    // depend on the array reference so follow keeps working past the cap.
  }, [lines, follow]);

  const onScroll = () => {
    const el = bodyRef.current;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${container.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" aria-label="Search logs" placeholder="Search…" className="h-8 w-44" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex items-center gap-1.5">
          <Checkbox id="logs-matches" checked={matchesOnly} onCheckedChange={(v) => setMatchesOnly(v === true)} />
          <Label htmlFor="logs-matches" className="text-xs font-normal">Matches only</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox id="logs-wrap" checked={wrap} onCheckedChange={(v) => setWrap(v === true)} />
          <Label htmlFor="logs-wrap" className="text-xs font-normal">Wrap</Label>
        </div>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" className="size-8" aria-label="Download logs" onClick={download}><Download className="size-4" /></Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label={expanded ? 'Shrink drawer' : 'Expand drawer'} onClick={() => setExpanded(!expanded)}>
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>
      {status === 'closed' && (
        <div className="flex items-center gap-2 rounded-md bg-bad-bg px-3 py-1.5 text-xs text-bad">
          Disconnected from the log stream.
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={reconnect}>Reconnect</Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={bodyRef}
          onScroll={onScroll}
          className={cn('absolute inset-0 overflow-auto rounded-md bg-muted p-2 font-mono text-xs leading-5', wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}
        >
          {shown.length === 0 && <span className="text-muted-foreground">{status === 'connecting' ? 'Connecting…' : 'No log lines yet.'}</span>}
          {shown.map((line, i) => (
            <div key={i} className={cn(/error|exception|fatal/i.test(line) && 'text-bad')}>
              <Highlighted text={line} term={term} />
            </div>
          ))}
        </div>
        {!follow && (
          <Button size="sm" className="absolute right-3 bottom-3 h-7 rounded-full shadow" onClick={() => setFollow(true)}>
            <ArrowDown className="size-3.5" /> Jump to latest
          </Button>
        )}
      </div>
    </div>
  );
}
