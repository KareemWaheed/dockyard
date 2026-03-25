import React, { useState } from 'react';
import { containerAction } from '../api';
import { Modal } from './UpdateTagModal';

export default function EnvPanel({ env, container, stackPath, onClose, onDone }) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [editKey, setEditKey] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [busy, setBusy] = useState(false);

  const envVars = Object.entries(container.env || {});

  const save = async (key, value) => {
    setBusy(true);
    try {
      await containerAction(env, container.name, 'update-env', { stackPath, serviceName: container.name, key, value });
      onDone(); // refresh parent but don't close
      setEditKey(null);
      setNewKey(''); setNewVal('');
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`⚙ Env Vars — ${container.name}`} onClose={onClose}>
      <div style={{ maxHeight: '50vh', overflow: 'auto', marginBottom: 12 }}>
        {envVars.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
            <span style={{ width: 180, flexShrink: 0, color: 'var(--blue)', fontSize: 11 }}>{k}</span>
            {editKey === k
              ? <>
                  <input value={editVal} onChange={e => setEditVal(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
                  <button onClick={() => save(k, editVal)} disabled={busy} style={{ background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '2px 8px' }}>Save</button>
                  <button onClick={() => setEditKey(null)} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none' }}>✕</button>
                </>
              : <>
                  <span style={{ flex: 1, color: 'var(--text)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                  {container.managed && <button onClick={() => { setEditKey(k); setEditVal(v); }} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: 10 }}>✏</button>}
                </>}
          </div>
        ))}
      </div>
      {container.managed && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 6 }}>Add new variable</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY" style={{ flex: 1 }} />
            <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" style={{ flex: 2 }} />
            <button onClick={() => { if (newKey) save(newKey, newVal); }} disabled={busy}
              style={{ background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '3px 10px' }}>
              Add
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
