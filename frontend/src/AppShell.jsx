import React, { useState, useEffect, useCallback } from 'react';
import { fetchContainers, fetchSettingsServers } from './api';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DashboardView from './components/DashboardView';
import BuildView from './components/BuildView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import CommandPalette from './components/CommandPalette';

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
  const [envs, setEnvs] = useState([]);
  const [activeEnv, setActiveEnv] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const [containersByEnv, setContainersByEnv] = useState({});
  const [fetchErrorByEnv, setFetchErrorByEnv] = useState({});
  const [stacksByEnv, setStacksByEnv] = useState({});
  const [lastRefreshByEnv, setLastRefreshByEnv] = useState({});
  const [standaloneByEnv, setStandaloneByEnv] = useState({});

  useEffect(() => {
    fetchSettingsServers().then(servers => {
      const keys = servers.map(s => s.env_key);
      setEnvs(keys);
      setActiveEnv(k => k && keys.includes(k) ? k : keys[0] ?? null);
      setContainersByEnv(prev => Object.fromEntries(keys.map(k => [k, prev[k] ?? null])));
      setFetchErrorByEnv(prev => Object.fromEntries(keys.map(k => [k, prev[k] ?? false])));
      setStacksByEnv(prev => Object.fromEntries(keys.map(k => [k, prev[k] ?? null])));
      setLastRefreshByEnv(prev => Object.fromEntries(keys.map(k => [k, prev[k] ?? null])));
      setStandaloneByEnv(prev => Object.fromEntries(keys.map(k => [k, prev[k] ?? []])));
    }).catch(() => {});
  }, []);

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

  // Poll all envs once loaded; re-poll every POLL_MS
  useEffect(() => {
    if (envs.length === 0) return;
    envs.forEach(env => loadEnvFull(env));
    const interval = setInterval(() => envs.forEach(env => loadEnvFull(env)), POLL_MS);
    return () => clearInterval(interval);
  }, [loadEnvFull, envs]);

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
        envs={envs}
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
