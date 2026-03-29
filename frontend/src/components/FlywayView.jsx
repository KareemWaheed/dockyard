// frontend/src/components/FlywayView.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchProjects, fetchBranches,
  fetchFlywayEnvs, startFlywayRun, fetchFlywayRuns, cancelFlywayRun,
} from '../api';

function wsBase() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

function statusColor(status) {
  if (status === 'success') return 'var(--green)';
  if (status === 'failed') return 'var(--red)';
  if (status === 'cancelled') return 'var(--text-dim)';
  return 'var(--yellow, #f59e0b)';
}
function statusLabel(status) {
  if (status === 'running') return '● running';
  if (status === 'success') return '✓ success';
  if (status === 'failed') return '✗ failed';
  return '○ cancelled';
}

export default function FlywayView() {
  const [flywayProjects, setFlywayProjects] = useState({});
  const [projectKeys, setProjectKeys] = useState([]);
  const [envs, setEnvs] = useState([]);

  const [project, setProject] = useState('');
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [needsClone, setNeedsClone] = useState(false);
  const [envId, setEnvId] = useState('');
  const [dbId, setDbId] = useState('');

  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [liveLog, setLiveLog] = useState('');
  const [liveStatus, setLiveStatus] = useState(null);

  const outputRef = useRef(null);
  const wsRef = useRef(null);

  // Load flyway projects and envs on mount
  useEffect(() => {
    fetchProjects().then(all => {
      const fw = Object.fromEntries(
        Object.entries(all).filter(([, p]) => p.isFlyway)
      );
      setFlywayProjects(fw);
      const keys = Object.keys(fw);
      setProjectKeys(keys);
      if (keys.length > 0) setProject(keys[0]);
    }).catch(() => {});

    fetchFlywayEnvs().then(data => {
      setEnvs(data);
      if (data.length > 0) {
        setEnvId(String(data[0].id));
        if (data[0].databases.length > 0) setDbId(String(data[0].databases[0].id));
      }
    }).catch(() => {});

    fetchFlywayRuns().then(data => {
      setRuns(data);
      if (data.length > 0) openRun(data[0]);
    }).catch(() => {});
  }, []);

  // Load branches when project changes
  useEffect(() => {
    if (!project) return;
    setBranches([]);
    setBranch('');
    setNeedsClone(false);
    setLoadingBranches(true);
    fetchBranches(project)
      .then(r => {
        setNeedsClone(!!r.needsClone);
        const b = r.branches || [];
        setBranches(b);
        if (b.length > 0) setBranch(b[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));
  }, [project]);

  // Update dbId when envId changes
  useEffect(() => {
    const env = envs.find(e => String(e.id) === envId);
    if (env && env.databases.length > 0) setDbId(String(env.databases[0].id));
    else setDbId('');
  }, [envId, envs]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [liveLog]);

  // Cleanup WS on unmount
  useEffect(() => () => { wsRef.current?.close(); }, []);

  const openRun = useCallback((run) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setSelectedRunId(run.id);
    setLiveLog('');
    setLiveStatus(run.status !== 'running' ? run.status : null);

    const ws = new WebSocket(`${wsBase()}/ws/flyway?runId=${run.id}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'chunk') setLiveLog(prev => prev + msg.text);
      if (msg.type === 'done') {
        setLiveStatus(msg.status);
        setRuns(prev => prev.map(r => r.id === run.id ? { ...r, status: msg.status } : r));
      }
    };
    ws.onerror = () => setLiveStatus(run.status || 'failed');
  }, []);

  const handleRun = async (command) => {
    if (command === 'migrate') {
      if (!window.confirm(`Run flyway:migrate against "${selectedDb?.name || dbId}"?\n\nThis will apply pending migrations.`)) return;
    }
    try {
      const result = await startFlywayRun({ envId: parseInt(envId), dbId: parseInt(dbId), project, branch, command });
      const run = {
        id: result.runId,
        run_number: result.runNumber,
        project, branch, command,
        status: 'running',
        env_name: selectedEnv?.name || '',
        db_name: selectedDb?.name || '',
        started_at: new Date().toISOString(),
      };
      setRuns(prev => [run, ...prev]);
      openRun(run);
    } catch (err) { console.error(err); }
  };

  const handleCancel = async () => {
    const run = runs.find(r => r.id === selectedRunId);
    if (!run) return;
    try {
      await cancelFlywayRun(run.id);
      setRuns(prev => prev.map(r => r.id === run.id ? { ...r, status: 'cancelled' } : r));
      setLiveStatus('cancelled');
    } catch (err) { console.error(err); }
  };

  const selectedEnv = envs.find(e => String(e.id) === envId);
  const selectedDb = selectedEnv?.databases.find(d => String(d.id) === dbId);
  const selectedRun = runs.find(r => r.id === selectedRunId);
  const isRunning = runs.some(r => r.status === 'running');
  const canRun = !needsClone && project && branch && envId && dbId && !isRunning;

  if (projectKeys.length === 0 && envs.length === 0) {
    return (
      <div className="flyway-view">
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          No flyway projects configured. In Settings → Build Projects, enable the "Flyway project" toggle on a project. Then add environments in Settings → Flyway.
        </div>
      </div>
    );
  }

  return (
    <div className="flyway-view">
      <div className="flyway-view-title">~~ Flyway Migrations</div>

      <div className="flyway-controls">
        <div className="flyway-controls-row">
          {/* Project */}
          <div className="flyway-field">
            <label className="form-label">Project</label>
            <select value={project} onChange={e => setProject(e.target.value)}>
              {projectKeys.map(k => (
                <option key={k} value={k}>{flywayProjects[k].name || k}</option>
              ))}
            </select>
          </div>

          {/* Branch */}
          <div className="flyway-field">
            <label className="form-label">Branch</label>
            {loadingBranches
              ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Fetching…</span>
              : needsClone
                ? <span style={{ color: 'var(--yellow, #f59e0b)', fontSize: 11 }}>Clone repo first via Build view</span>
                : (
                  <select value={branch} onChange={e => setBranch(e.target.value)}>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                )
            }
          </div>

          {/* Environment */}
          <div className="flyway-field">
            <label className="form-label">Environment</label>
            <select value={envId} onChange={e => setEnvId(e.target.value)}>
              {envs.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
              {envs.length === 0 && <option value="">No environments</option>}
            </select>
          </div>

          {/* Database */}
          <div className="flyway-field">
            <label className="form-label">Database</label>
            <select value={dbId} onChange={e => setDbId(e.target.value)}>
              {(selectedEnv?.databases || []).map(d => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
              {!selectedEnv?.databases?.length && <option value="">No databases</option>}
            </select>
          </div>
        </div>

        <div className="flyway-actions">
          <button className="btn-flyway-info" onClick={() => handleRun('info')} disabled={!canRun}>
            &gt;&gt; Info
          </button>
          <button className="btn-flyway-migrate" onClick={() => handleRun('migrate')} disabled={!canRun}>
            &gt;&gt; Migrate
          </button>
          {isRunning && (
            <button
              onClick={handleCancel}
              style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
            >
              Cancel
            </button>
          )}
          {liveStatus && !isRunning && (
            <span style={{ color: statusColor(liveStatus), fontSize: 11 }}>{statusLabel(liveStatus)}</span>
          )}
        </div>
      </div>

      {/* Output */}
      <div className="flyway-output">
        <div className="flyway-output-header">
          <span>
            {selectedRun
              ? `#${selectedRun.run_number} — ${selectedRun.command} · ${selectedRun.env_name || ''} / ${selectedRun.db_name || ''}`
              : 'Output'
            }
          </span>
        </div>
        <div className="flyway-output-terminal" ref={outputRef}>
          {liveLog || <span style={{ color: 'var(--text-dim)' }}>Run Info or Migrate to see output…</span>}
        </div>
      </div>

      {/* History */}
      {runs.length > 0 && (
        <div className="flyway-history">
          <div className="flyway-history-label">Run History</div>
          <table className="flyway-history-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Project</th>
                <th>Branch</th>
                <th>Env</th>
                <th>Database</th>
                <th>Command</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr
                  key={run.id}
                  className={selectedRunId === run.id ? 'active' : ''}
                  onClick={() => openRun(run)}
                >
                  <td>{run.run_number}</td>
                  <td>{run.project}</td>
                  <td>{run.branch}</td>
                  <td>{run.env_name || '—'}</td>
                  <td>{run.db_name || '—'}</td>
                  <td style={{ color: run.command === 'migrate' ? 'var(--orange, #f7825f)' : 'var(--blue)' }}>
                    {run.command}
                  </td>
                  <td style={{ color: statusColor(run.status) }}>{statusLabel(run.status)}</td>
                  <td style={{ color: 'var(--text-dim)' }}>
                    {run.started_at ? new Date(run.started_at + 'Z').toLocaleString() : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
