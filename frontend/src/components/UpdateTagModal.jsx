import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { containerAction } from '../api';

export default function UpdateTagModal({ env, container, stackPath, onClose, onDone }) {
  const currentTag = container.image?.split(':').pop() || '';
  const [tag, setTag] = useState(currentTag);
  const [note, setNote] = useState(container.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!tag.trim()) return;
    setBusy(true); setError('');
    try {
      await containerAction(env, container.name, 'update-tag', {
        stackPath, serviceName: container.name, newTag: tag.trim(), note,
      });
      onDone(); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Update Tag — ${container.name}`} onClose={onClose}>
      <div className="form-field" style={{ marginBottom: 10 }}>
        <label className="form-label">New image tag</label>
        <input value={tag} onChange={e => setTag(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div className="form-field" style={{ marginBottom: 14 }}>
        <label className="form-label">Notes (branch / release)</label>
        <input value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%' }} />
      </div>
      {error && <div style={{ color: 'var(--red)', marginBottom: 10, fontSize: 11 }}>{error}</div>}
      <button
        onClick={submit}
        disabled={busy}
        className="btn-primary"
        style={{ padding: '6px 20px' }}
      >
        {busy ? 'Deploying…' : 'Deploy ↗'}
      </button>
    </Modal>
  );
}

export function Modal({ title, onClose, children }) {
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
