import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { appendChunk } from '@/features/container/logBuffer';
import { qk } from '@/lib/queries';

const EMPTY = { lines: [], partial: '' };
const META_FIELDS = ['commits_json', 'branch', 'pushed_images_json'];
const pickMeta = (msg) => Object.fromEntries(META_FIELDS.filter((k) => msg[k] != null).map((k) => [k, msg[k]]));

export function useRunStream(kind, runId, { project, active = false } = {}) {
  const qc = useQueryClient();
  const [buf, setBuf] = useState(EMPTY);
  const [status, setStatus] = useState('connecting');
  const [finalStatus, setFinalStatus] = useState(null);
  const [stuck, setStuck] = useState(false);
  const [meta, setMeta] = useState({});
  const [attempt, setAttempt] = useState(0);
  // Read at message time so changing them doesn't reopen the socket.
  const opts = useRef({ project, active, qc });
  opts.current = { project, active, qc };

  useEffect(() => {
    if (runId == null) return undefined;
    setBuf(EMPTY);
    setStatus('connecting');
    setFinalStatus(null);
    setStuck(false);
    setMeta({});
    const wasActive = opts.current.active;
    let done = false;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/${kind === 'build' ? 'builds' : 'flyway'}?runId=${runId}`);
    ws.onopen = () => setStatus('open');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'chunk') {
        setStuck(false);
        setBuf((b) => appendChunk(b.lines, b.partial, msg.text));
      } else if (msg.type === 'error') {
        setBuf((b) => appendChunk(b.lines, b.partial, `\nERROR: ${msg.message}\n`));
      } else if (msg.type === 'stuck_alert') {
        setStuck(true);
      } else if (msg.type === 'meta') {
        setMeta((m) => ({ ...m, ...pickMeta(msg) }));
      } else if (msg.type === 'done') {
        done = true;
        setStuck(false);
        setFinalStatus(msg.status);
        setStatus('done');
        setMeta((m) => ({ ...m, ...pickMeta(msg) }));
        if (wasActive) {
          const { qc: client, project: p } = opts.current;
          if (kind === 'build') {
            client.invalidateQueries({ queryKey: qk.buildRuns(p) });
            client.invalidateQueries({ queryKey: ['build-run', p] });
          } else {
            client.invalidateQueries({ queryKey: qk.flywayRuns });
            client.invalidateQueries({ queryKey: ['flyway-run'] });
          }
        }
      }
    };
    const onDrop = () => {
      if (!done) setStatus('closed');
    };
    ws.onclose = onDrop;
    ws.onerror = onDrop;
    return () => {
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [kind, runId, attempt]);

  useEffect(() => {
    if (status !== 'closed') return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status]);

  const lines = buf.partial ? [...buf.lines, buf.partial] : buf.lines;
  return { lines, status, finalStatus, stuck, meta, reconnect: () => setAttempt((n) => n + 1) };
}
