import React from 'react';

export default function TopBar({ onSearchClick, lastRefresh, onRefresh, theme, onToggleTheme }) {
  return (
    <div className="topbar">
      <div className="topbar-search" onClick={onSearchClick}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>⌘</span>
        <span>Search containers, stacks...</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, background: 'rgba(99,179,237,0.08)', padding: '1px 5px', borderRadius: 3, color: 'var(--text-dim)' }}>K</span>
      </div>
      <div className="topbar-right">
        {lastRefresh && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Refreshed {lastRefresh}</span>}
        <button className="btn" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onToggleTheme} style={{ fontSize: 13, padding: '3px 8px' }}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="btn-primary" onClick={onRefresh}>↻ Refresh</button>
      </div>
    </div>
  );
}
