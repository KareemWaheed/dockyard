import React from 'react';
import { Modal } from './UpdateTagModal';

export default function VersionInfoModal({ container, onClose }) {
  const vi = container.versionInfo || {};
  // `raw` is every key/value actually present in the source file (git.properties
  // or build-info.json) — shows the full contents, not just the curated fields.
  const entries = Object.entries(vi.raw || {});
  const dirty = vi.dirty === true || vi.dirty === 'true';

  return (
    <Modal title={`Build Info — ${container.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflow: 'auto' }}>
        {entries.length === 0 && (
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
