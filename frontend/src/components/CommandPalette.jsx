import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function filterContainers(allContainers, query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return allContainers.filter(c => c.name.toLowerCase().includes(q));
}

export default function CommandPalette({ containersByEnv, onEnvChange, onViewChange, onClose }) {
  const [query, setQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Flatten all containers across envs with their env tag
  const allContainers = Object.entries(containersByEnv).flatMap(([env, containers]) =>
    (containers || []).map(c => ({ ...c, env }))
  );

  const containerResults = filterContainers(allContainers, query);

  // Action results
  const actionResults = query.toLowerCase().includes('build')
    ? [{ type: 'action', label: 'Go to Build', key: 'build' }]
    : [];

  const allResults = [...containerResults.map(c => ({ type: 'container', ...c })), ...actionResults];

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, allResults.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && allResults[focusedIdx]) selectResult(allResults[focusedIdx]);
    if (e.key === 'Escape') onClose();
  };

  const selectResult = (result) => {
    if (result.type === 'container') {
      onEnvChange(result.env);
      onClose();
      const containerId = result.name.replace(/^\//, '');
      setTimeout(() => {
        document.getElementById(containerId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
    if (result.type === 'action' && result.key === 'build') {
      onViewChange('build');
      onClose();
    }
  };

  return createPortal(
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-box" onClick={e => e.stopPropagation()}>
        <div className="palette-input-row">
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>⌘</span>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setFocusedIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search containers..."
          />
          <span className="palette-hint">ESC to close</span>
        </div>

        <div className="palette-results">
          {allResults.length === 0 && query && (
            <div style={{ padding: '12px 14px', color: 'var(--text-dim)', fontSize: 11 }}>No results for "{query}"</div>
          )}
          {containerResults.length > 0 && (
            <>
              <div className="palette-section-label">Containers</div>
              {containerResults.map((c, i) => (
                <div
                  key={`${c.env}-${c.name}`}
                  className={`palette-item ${focusedIdx === i ? 'focused' : ''}`}
                  onClick={() => selectResult({ type: 'container', ...c })}
                >
                  <span className={`container-status-dot ${c.status === 'running' ? 'running' : 'stopped'}`} />
                  <span className="palette-item-name">{c.name}</span>
                  <span className="palette-item-sub">{c.stack}</span>
                  <span className={`palette-env-badge ${c.env === 'prod' ? 'prod' : ''}`}>{c.env.toUpperCase()}</span>
                </div>
              ))}
            </>
          )}
          {actionResults.length > 0 && (
            <>
              <div className="palette-section-label">Actions</div>
              {actionResults.map((a, i) => {
                const idx = containerResults.length + i;
                return (
                  <div
                    key={a.key}
                    className={`palette-item ${focusedIdx === idx ? 'focused' : ''}`}
                    onClick={() => selectResult(a)}
                  >
                    <span style={{ color: 'var(--blue)' }}>&gt;&gt;</span>
                    <span className="palette-item-name">{a.label}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
