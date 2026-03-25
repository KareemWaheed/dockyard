import React, { useState } from 'react';
import { addService } from '../api';
import { Modal } from './UpdateTagModal';

export default function AddServicePanel({ env, stackIdx, stackPath, existingServices, onClose, onDone }) {
  const [mode, setMode] = useState('new'); // 'new' | 'clone'
  const [cloneSource, setCloneSource] = useState('');
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [ports, setPorts] = useState([{ host: '', container: '' }]);
  const [envVars, setEnvVars] = useState([{ key: '', value: '' }]);
  const [restart, setRestart] = useState('always');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadClone = () => {
    const src = existingServices.find(c => c.name === cloneSource);
    if (!src) return;
    setImage(src.image || '');
    setEnvVars(Object.entries(src.env || {}).map(([key, value]) => ({ key, value })));
  };

  const submit = async () => {
    if (!name.trim() || !image.trim()) return setError('Name and image are required');
    setBusy(true); setError('');
    try {
      const environment = Object.fromEntries(envVars.filter(e => e.key).map(e => [e.key, e.value]));
      const portList = ports.filter(p => p.host && p.container).map(p => `${p.host}:${p.container}`);
      await addService(env, stackIdx, { name: name.trim(), image: image.trim(), ports: portList, environment, restart });
      onDone(); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="+ Add Service" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMode('new')} style={{ background: mode === 'new' ? '#1a2e1a' : 'transparent', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '4px 12px' }}>New</button>
        <button onClick={() => setMode('clone')} style={{ background: mode === 'clone' ? '#1a2434' : 'transparent', color: 'var(--blue)', border: '1px solid #1e3a5f', padding: '4px 12px' }}>Clone Existing</button>
      </div>

      {mode === 'clone' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <select value={cloneSource} onChange={e => setCloneSource(e.target.value)} style={{ flex: 1 }}>
            <option value="">Pick a service to clone…</option>
            {existingServices.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button onClick={loadClone} style={{ background: '#1a2434', color: 'var(--blue)', border: '1px solid #1e3a5f', padding: '4px 10px' }}>Load</button>
        </div>
      )}

      <Field label="Service name (unique)"><input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} /></Field>
      <Field label="Image:tag"><input value={image} onChange={e => setImage(e.target.value)} style={{ width: '100%' }} /></Field>
      <Field label="Restart policy">
        <select value={restart} onChange={e => setRestart(e.target.value)} style={{ width: '100%' }}>
          {['always', 'unless-stopped', 'on-failure', 'no'].map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Ports (host:container)">
        {ports.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={p.host} onChange={e => setPorts(ports.map((x, j) => j === i ? { ...x, host: e.target.value } : x))} placeholder="host" style={{ width: 80 }} />
            <span>:</span>
            <input value={p.container} onChange={e => setPorts(ports.map((x, j) => j === i ? { ...x, container: e.target.value } : x))} placeholder="container" style={{ width: 80 }} />
            <button onClick={() => setPorts(ports.filter((_, j) => j !== i))} style={{ background: 'transparent', color: 'var(--red)', border: 'none' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setPorts([...ports, { host: '', container: '' }])} style={{ background: 'transparent', color: 'var(--blue)', border: '1px dashed var(--border)', padding: '2px 8px', fontSize: 10 }}>+ Add port</button>
      </Field>
      <Field label="Environment variables">
        {envVars.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={e.key} onChange={ev => setEnvVars(envVars.map((x, j) => j === i ? { ...x, key: ev.target.value } : x))} placeholder="KEY" style={{ width: 140 }} />
            <input value={e.value} onChange={ev => setEnvVars(envVars.map((x, j) => j === i ? { ...x, value: ev.target.value } : x))} placeholder="value" style={{ flex: 1 }} />
            <button onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))} style={{ background: 'transparent', color: 'var(--red)', border: 'none' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setEnvVars([...envVars, { key: '', value: '' }])} style={{ background: 'transparent', color: 'var(--blue)', border: '1px dashed var(--border)', padding: '2px 8px', fontSize: 10 }}>+ Add var</button>
      </Field>

      {error && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8 }}>{error}</div>}
      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>com.namaa.dashboard.managed=true will be added automatically.</div>
      <button onClick={submit} disabled={busy} style={{ marginTop: 12, background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '6px 20px' }}>
        {busy ? 'Creating…' : 'Create Service ↗'}
      </button>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
