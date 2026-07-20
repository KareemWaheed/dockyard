import React, { useEffect, useState } from 'react';
import { Modal } from './UpdateTagModal';
import { containerAction } from '../api';

export default function VersionInfoModal({ env, container, stackPath, onClose }) {
  const [vi, setVi] = useState(null);
  const [error, setError] = useState('');
  const serviceName = container.serviceName || container.name;

  useEffect(() => {
    containerAction(env, container.name, 'version-info', { stackPath, serviceName })
      .then(setVi)
      .catch(e => setError(e.message));
  }, [env, container.name, stackPath, serviceName]);

  const entries = Object.entries(vi?.raw || {});
  const dirty = vi?.dirty === true || vi?.dirty === 'true';

  return (
    <Modal title={`Build Info — ${container.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflow: 'auto' }}>
        {error && <span style={{ fontSize: 11, color: 'var(--red)' }}>{error}</span>}
        {!error && !vi && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</span>}
        {!error && vi && entries.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No build info fields found.</span>
        )}
        {entries.map(([key, value]) => {
          const isDirtyField = /dirty/i.test(key);
          return (
            <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ width: 150, flexShrink: 0, color: 'var(--text-muted)', fontSize: 11, wordBreak: 'break-all' }}>{key}</span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  color: isDirtyField && dirty ? 'var(--red)' : 'var(--text)',
                }}
              >
                {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') || '—'}
              </span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
