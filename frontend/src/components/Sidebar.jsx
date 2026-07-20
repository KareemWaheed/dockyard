import React, { useEffect, useState } from 'react';

export default function Sidebar({ activeEnv, activeView, onEnvChange, onViewChange, envStatuses, envs, open }) {

  const totalConnected = Object.values(envStatuses).filter(s => s !== 'loading' && s !== 'unknown').length;
  const allHealthy = Object.values(envStatuses).every(s => s === 'healthy');

  const [buildInfo, setBuildInfo] = useState(null);
  useEffect(() => {
    fetch('/build-info.json')
      .then(r => r.ok ? r.json() : null)
      .then(setBuildInfo)
      .catch(() => {});
  }, []);

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-name">DOCKYARD</div>
        <div className="sidebar-logo-sub">DEVOPS</div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Environments</div>
        {envs.map(env => (
          <button
            key={env}
            className={`sidebar-item ${activeView === 'dashboard' && activeEnv === env ? 'active' : ''}`}
            onClick={() => onEnvChange(env)}
          >
            <span className={`status-dot ${envStatuses[env] || 'loading'}`} />
            {env.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section">
        <div className="sidebar-label">Tools</div>
        <button
          className={`sidebar-item ${activeView === 'build' ? 'active' : ''}`}
          onClick={() => onViewChange('build')}
        >
          &gt;&gt; Build
        </button>
        <button
          className={`sidebar-item ${activeView === 'flyway' ? 'active' : ''}`}
          onClick={() => onViewChange('flyway')}
        >
          ~~ Flyway
        </button>
        <button
          className={`sidebar-item ${activeView === 'history' ? 'active' : ''}`}
          onClick={() => onViewChange('history')}
        >
          ≡ History
        </button>
        <button
          className={`sidebar-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          ⚙ Settings
        </button>
      </div>

      <div className="sidebar-footer">
        <div>{totalConnected} envs connected</div>
        <div style={{ color: allHealthy ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>
          {allHealthy ? '● all healthy' : '● issues detected'}
        </div>
        {buildInfo?.shortCommit && buildInfo.shortCommit !== 'unknown' && (
          <div
            className="sidebar-build-info"
            title={`Branch: ${buildInfo.branch}\nCommit: ${buildInfo.commit}\nBuilt: ${buildInfo.buildTime}`}
          >
            build {buildInfo.shortCommit}
          </div>
        )}
      </div>
    </aside>
  );
}
