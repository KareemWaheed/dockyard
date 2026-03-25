import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function LogsPanel({ env, container, onClose }) {
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const [open, setOpen] = useState(false);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const MAX_LINES = 1000;

  const connect = () => {
    setDisconnected(false);
    setLines([]);
    const ws = new WebSocket(`ws://localhost:3001/ws/logs?env=${env}&container=${container}`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'line') {
        setLines(prev => {
          const next = [...prev, msg.text];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      if (msg.type === 'error') setLines(prev => [...prev, `ERROR: ${msg.message}`]);
    };
    ws.onclose = () => setDisconnected(true);
    wsRef.current = ws;
  };

  useEffect(() => {
    connect();
    // Trigger open animation on next frame
    requestAnimationFrame(() => setOpen(true));
    return () => wsRef.current?.close();
  }, []);

  const filtered = search
    ? lines.filter(l => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  return createPortal(
    <>
      <div className="logs-backdrop" onClick={onClose} />
      <div className={`logs-panel ${open ? 'open' : ''}`}>
        <div className="logs-header">
          <span style={{ color: 'var(--purple)', flexShrink: 0 }}>Logs</span>
          <span style={{ color: 'var(--text)', flex: 1 }}>{container}</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: 160, fontSize: 10 }}
          />
          {disconnected && (
            <>
              <span style={{ color: 'var(--red)', fontSize: 10 }}>Disconnected</span>
              <button onClick={connect} className="btn" style={{ color: 'var(--green)', fontSize: 10 }}>Reconnect</button>
            </>
          )}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="logs-body">
          {filtered.map((line, i) => (
            <div
              key={i}
              className={`log-line ${line.toLowerCase().includes('error') ? 'error' : ''} ${search && line.toLowerCase().includes(search.toLowerCase()) ? 'highlight' : ''}`}
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </>,
    document.body
  );
}
