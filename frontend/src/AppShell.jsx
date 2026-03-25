import React, { useState, useEffect, useCallback } from 'react';
import { fetchContainers } from './api';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DashboardView from './components/DashboardView';
import BuildView from './components/BuildView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import CommandPalette from './components/CommandPalette';

const ENVS = ['dev', 'test', 'stage', 'prod'];
const POLL_MS = 30000;

export function computeEnvStatuses(containersByEnv, fetchErrorByEnv) {
  const result = {};
  for (const env of Object.keys(containersByEnv)) {
    const containers = containersByEnv[env];
    const hasError = fetchErrorByEnv[env];
    if (hasError) { result[env] = 'unknown'; continue; }
    if (containers === null) { result[env] = 'loading'; continue; }
    const allRunning = containers.every(c => c.status === 'running');
    result[env] = allRunning ? 'healthy' : 'degraded';
  }
  return result;
}

export default function AppShell() {
  const [activeEnv, setActiveEnv] = useState('dev');
  const [activeView, setActiveView] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const [containersByEnv, setContainersByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, null]))
  );
  const [fetchErrorByEnv, setFetchErrorByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, false]))
  );
  const [stacksByEnv, setStacksByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, null]))
  );
  const [lastRefreshByEnv, setLastRefreshByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, null]))
  );
  const [standaloneByEnv, setStandaloneByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, []]))
  );

  const loadEnvFull = useCallback(async (env) => {
    try {
      const result = await fetchContainers(env);
      const allContainers = result.stacks?.flatMap(s =>
        s.containers.map(c => ({ ...c, stack: s.name, stackPath: s.path }))
      ) || [];
      setContainersByEnv(prev => ({ ...prev, [env]: allContainers }));
      setStacksByEnv(prev => ({ ...prev, [env]: result.stacks || [] }));
      setStandaloneByEnv(prev => ({ ...prev, [env]: result.standalone || [] }));
      setLastRefreshByEnv(prev => ({ ...prev, [env]: new Date().toLocaleTimeString() }));
      setFetchErrorByEnv(prev => ({ ...prev, [env]: false }));
    } catch {
      setFetchErrorByEnv(prev => ({ ...prev, [env]: true }));
    }
  }, []);

  // Poll all envs on mount; re-poll every POLL_MS
  useEffect(() => {
    ENVS.forEach(env => loadEnvFull(env));
    const interval = setInterval(() => ENVS.forEach(env => loadEnvFull(env)), POLL_MS);
    return () => clearInterval(interval);
  }, [loadEnvFull]);

  // Keyboard shortcut for palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const envStatuses = computeEnvStatuses(containersByEnv, fetchErrorByEnv);

  const handleEnvChange = (env) => {
    setActiveEnv(env);
    setActiveView('dashboard');
  };

  const handleRefresh = useCallback((env) => loadEnvFull(env), [loadEnvFull]);

  return (
    <div className="app-shell">
      <Sidebar
        activeEnv={activeEnv}
        activeView={activeView}
        onEnvChange={handleEnvChange}
        onViewChange={setActiveView}
        envStatuses={envStatuses}
      />
      <div className="app-main">
        <TopBar
          onSearchClick={() => setPaletteOpen(true)}
          lastRefresh={lastRefreshByEnv[activeEnv]}
          onRefresh={() => handleRefresh(activeEnv)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {activeView === 'dashboard' && (
          <DashboardView
            env={activeEnv}
            stacks={stacksByEnv[activeEnv]}
            standalone={standaloneByEnv[activeEnv]}
            fetchError={fetchErrorByEnv[activeEnv]}
            lastRefresh={lastRefreshByEnv[activeEnv]}
            onRefresh={() => handleRefresh(activeEnv)}
          />
        )}
        {activeView === 'build' && <BuildView />}
        {activeView === 'history' && <HistoryView />}
        {activeView === 'settings' && <SettingsView />}
      </div>
      {paletteOpen && (
        <CommandPalette
          containersByEnv={containersByEnv}
          onEnvChange={handleEnvChange}
          onViewChange={setActiveView}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
