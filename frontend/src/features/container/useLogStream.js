import { useEffect, useState } from 'react';
import { appendChunk } from '@/features/container/logBuffer';

export function useLogStream(env, container) {
  const [buf, setBuf] = useState({ lines: [], partial: '' });
  const [status, setStatus] = useState('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setBuf({ lines: [], partial: '' });
    setStatus('connecting');
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs?env=${encodeURIComponent(env)}&container=${encodeURIComponent(container)}`);
    ws.onopen = () => setStatus('open');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'line') setBuf((b) => appendChunk(b.lines, b.partial, msg.text));
      if (msg.type === 'error') setBuf((b) => appendChunk(b.lines, b.partial, `\nERROR: ${msg.message}\n`));
      if (msg.type === 'closed') setStatus('closed');
    };
    ws.onclose = () => setStatus('closed');
    ws.onerror = () => setStatus('closed');
    return () => {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [env, container, attempt]);

  const lines = buf.partial ? [...buf.lines, buf.partial] : buf.lines;
  return { lines, status, reconnect: () => setAttempt((n) => n + 1) };
}
