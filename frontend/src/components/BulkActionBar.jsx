import React, { useState } from 'react';
import { containerAction } from '../api';

export default function BulkActionBar({ env, selected, onClear, onDone }) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  const runBulk = async (action, extraBody = {}) => {
    setBusy(true); setResults([]);
    for (const c of selected) {
      setResults(prev => [...prev, { name: c.name, status: 'running' }]);
      try {
        await containerAction(env, c.name, action, { stackPath: c.stackPath, serviceName: c.name, ...extraBody });
        setResults(prev => prev.map(r => r.name === c.name ? { ...r, status: 'done' } : r));
      } catch (e) {
        setResults(prev => prev.map(r => r.name === c.name ? { ...r, status: 'failed', error: e.message } : r));
      }
    }
    setBusy(false); onDone();
  };

  return (
    <div className="bulk-bar">
      <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{selected.length} selected</span>
      <span style={{ color: 'var(--border)' }}>|</span>
      <button className="btn-action" style={{ color: 'var(--yellow)' }} onClick={() => runBulk('restart')} disabled={busy}>↻ Restart All</button>
      <button className="btn-action" style={{ color: 'var(--indigo)' }} onClick={() => runBulk('up')} disabled={busy}>▶ Up All</button>
      <button className="btn-action" style={{ color: 'var(--orange)' }} onClick={() => runBulk('up', { forceRecreate: true })} disabled={busy}>⚡ Force Recreate All</button>
      <button className="btn-action" style={{ color: 'var(--red)' }} onClick={() => runBulk('stop')} disabled={busy}>■ Stop All</button>
      <button className="btn-action" style={{ color: 'var(--green)' }} onClick={() => setShowTagInput(t => !t)} disabled={busy}>Set Tag</button>
      {showTagInput && (
        <>
          <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder="new-tag" style={{ width: 140 }} />
          <button className="btn-primary" onClick={() => runBulk('update-tag', { newTag: bulkTag })} disabled={busy || !bulkTag}>Apply</button>
        </>
      )}
      <button className="btn-action" style={{ color: 'var(--red)', marginLeft: 'auto' }} onClick={onClear}>✕ Clear</button>
      {results.length > 0 && (
        <div className="bulk-results">
          {results.map(r => (
            <span key={r.name} style={{ color: r.status === 'done' ? 'var(--green)' : r.status === 'failed' ? 'var(--red)' : 'var(--text-dim)' }}>
              {r.name}: {r.status === 'done' ? '✓' : r.status === 'failed' ? `✗ ${r.error}` : '…'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
