import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchProjects, fetchBranches, startBuild, cloneRepo,
  fetchBuildRuns, cancelBuildRun, replayBuildRun,
} from '../api';
import SearchableSelect from './SearchableSelect';

const RECENT_KEY = 'dockyard_build_recent';
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || {}; } catch { return {}; }
}
function saveRecent(projectKey, formValues) {
  const recent = loadRecent();
  recent[projectKey] = formValues;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}
function initFormState(params) {
  const state = {};
  for (const p of params) {
    if (p.type === 'multiselect') state[p.name] = p.default || [];
    else if (p.type === 'checkbox') state[p.name] = p.default || false;
    else state[p.name] = p.default || '';
  }
  return state;
}
function buildArgs(params, formValues) {
  const args = [];
  for (const p of params) {
    const val = formValues[p.name];
    if (p.type === 'checkbox') { if (val) args.push(p.flag); }
    else if (p.type === 'multiselect') { if (Array.isArray(val)) val.forEach(item => args.push(p.flag, item)); }
    else { if (val) args.push(p.flag, val); }
  }
  return args;
}
function isFormValid(params, formValues, branch) {
  if (!branch) return false;
  for (const p of params) {
    if (!p.required) continue;
    const val = formValues[p.name];
    if (p.type === 'multiselect') { if (!val || val.length === 0) return false; }
    else if (p.type !== 'checkbox') { if (!val) return false; }
  }
  return true;
}
function statusColor(status) {
  if (status === 'success') return 'var(--green)';
  if (status === 'failed') return 'var(--red)';
  if (status === 'cancelled') return 'var(--text-dim)';
  if (status === 'queued') return 'var(--text-dim)';
  return 'var(--yellow, #f59e0b)';
}
function statusLabel(status) {
  if (status === 'running') return '● running';
  if (status === 'success') return '✓ success';
  if (status === 'failed') return '✗ failed';
  if (status === 'queued') return '◌ queued';
  return '○ cancelled';
}
function wsBase() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

function parseArgsToParams(params, argsJson, branch) {
  const args = (() => { try { return JSON.parse(argsJson || '[]'); } catch { return []; } })();
  const result = [];
  if (branch) result.push({ label: 'Branch', value: branch });
  for (const p of (params || [])) {
    if (p.type === 'checkbox') {
      result.push({ label: p.label || p.name, value: args.includes(p.flag) ? 'yes' : 'no' });
    } else if (p.type === 'multiselect') {
      const vals = [];
      args.forEach((a, i) => { if (a === p.flag && i + 1 < args.length) vals.push(args[i + 1]); });
      if (vals.length > 0) result.push({ label: p.label || p.name, value: vals.join(', ') });
    } else {
      const idx = args.indexOf(p.flag);
      if (idx !== -1 && idx + 1 < args.length) result.push({ label: p.label || p.name, value: args[idx + 1] });
    }
  }
  return result;
}

export default function BuildView() {
  const [projects, setProjects] = useState({});
  const [projectKeys, setProjectKeys] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [formStates, setFormStates] = useState({});
  const [branchStates, setBranchStates] = useState({});
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [needsClone, setNeedsClone] = useState(false);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [liveLog, setLiveLog] = useState('');
  const [liveStatus, setLiveStatus] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const [loading, setLoading] = useState(true);
  const outputRef = useRef(null);
  const wsRef = useRef(null);
  const [stuckAlert, setStuckAlert] = useState(false);

  useEffect(() => {
    fetchProjects().then(data => {
      setProjects(data);
      const keys = Object.keys(data);
      setProjectKeys(keys);
      const forms = {};
      const br = {};
      for (const key of keys) {
        forms[key] = initFormState(data[key].params || []);
        br[key] = '';
      }
      setFormStates(forms);
      setBranchStates(br);
      if (keys.length > 0) setActiveProject(keys[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openRun = useCallback((run) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setSelectedRunId(run.id);
    setLiveLog('');
    setLiveStatus(run.status !== 'running' ? run.status : null);
    setStuckAlert(false);

    const ws = new WebSocket(`${wsBase()}/ws/builds?runId=${run.id}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'chunk') { setStuckAlert(false); setLiveLog(prev => prev + msg.text); }
      if (msg.type === 'stuck_alert') setStuckAlert(true);
      if (msg.type === 'done') {
        setStuckAlert(false);
        setLiveStatus(msg.status);
        setRuns(prev => prev.map(r => r.id === run.id
          ? { ...r, status: msg.status, commits_json: msg.commits_json ?? r.commits_json }
          : r));
      }
    };
    ws.onerror = () => setLiveStatus(run.status || 'failed');
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    // Reset run selection on project switch to avoid stale closure
    setSelectedRunId(null);
    setRuns([]);
    setLiveLog('');
    setLiveStatus(null);
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    setLoadingBranches(true); setNeedsClone(false);
    fetchBranches(activeProject)
      .then(r => {
        setNeedsClone(!!r.needsClone);
        setBranches(r.branches || []);
        if (!branchStates[activeProject]) setBranchStates(p => ({ ...p, [activeProject]: r.branches?.[0] || '' }));
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));

    fetchBuildRuns(activeProject)
      .then(r => {
        setRuns(r);
        if (r.length > 0) openRun(r[0]);
      })
      .catch(() => {});
  }, [activeProject]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [liveLog]);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  const proj = activeProject ? projects[activeProject] : null;
  const params = proj?.params || [];
  const form = formStates[activeProject] || {};
  const branch = branchStates[activeProject] || '';

  const setField = (key, value) => setFormStates(prev => ({
    ...prev, [activeProject]: { ...prev[activeProject], [key]: value },
  }));
  const setBranch = (value) => setBranchStates(prev => ({ ...prev, [activeProject]: value }));

  const isRunning = runs.some(r => r.status === 'running');
  const canBuild = !needsClone && isFormValid(params, form, branch);

  const handleClone = async () => {
    try {
      const result = await cloneRepo(activeProject);
      if (result.alreadyCloned) { setNeedsClone(false); return; }
      const run = { id: result.runId, build_number: result.buildNumber, type: 'clone', status: 'running', started_at: new Date().toISOString() };
      setRuns(prev => [run, ...prev]);
      openRun(run);
      setNeedsClone(false);
    } catch (err) { console.error(err); }
  };

  const handleBuild = async () => {
    if (!canBuild) return;
    const args = buildArgs(params, form);
    saveRecent(activeProject, { branch, ...form });
    setRecent(loadRecent());
    try {
      const result = await startBuild(activeProject, branch, args);
      const run = {
        id: result.runId,
        build_number: result.buildNumber,
        type: 'build',
        status: result.queued ? 'queued' : 'running',
        branch,
        started_at: new Date().toISOString(),
      };
      setRuns(prev => [run, ...prev]);
      openRun(run);
    } catch (err) { console.error(err); }
  };

  const handleReplay = async () => {
    if (!selectedRun || selectedRun.type !== 'build') return;
    try {
      const result = await replayBuildRun(activeProject, selectedRun.build_number);
      const run = {
        id: result.runId,
        build_number: result.buildNumber,
        type: 'build',
        status: result.queued ? 'queued' : 'running',
        branch: selectedRun.branch,
        args_json: selectedRun.args_json,
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
      await cancelBuildRun(activeProject, run.build_number);
      // Optimistically reflect the cancellation — the WS done message will
      // confirm the final status, but the button should disappear immediately.
      setRuns(prev => prev.map(r => r.id === run.id ? { ...r, status: 'cancelled' } : r));
      setLiveStatus('cancelled');
    } catch (err) { console.error(err); }
  };

  const selectedRun = runs.find(r => r.id === selectedRunId);
  const isSelectedActive = selectedRun?.status === 'running' || selectedRun?.status === 'queued';

  const parsedParams = selectedRun?.type === 'build'
    ? parseArgsToParams(params, selectedRun?.args_json, selectedRun?.branch)
    : [];
  const parsedCommits = (() => { try { return JSON.parse(selectedRun?.commits_json || '[]'); } catch { return []; } })();

  if (loading) return <div className="build-view" style={{ padding: 24, color: 'var(--text-dim)' }}>Loading projects…</div>;
  if (projectKeys.length === 0) return <div className="build-view" style={{ padding: 24, color: 'var(--text-dim)' }}>No build projects configured. Add projects in Settings → Build Projects.</div>;

  return (
    <div className="build-view">
      {/* Col 1: Project picker */}
      <div className="build-projects">
        <div style={{ padding: '0 12px', marginBottom: 8 }}>
          <div className="build-recent-label">Project</div>
        </div>
        {projectKeys.map(key => (
          <button
            key={key}
            className={`build-project-item ${activeProject === key ? 'active' : ''}`}
            onClick={() => setActiveProject(key)}
          >
            {projects[key].name}
          </button>
        ))}
        <div className="build-recent">
          <div className="build-recent-label">Recent</div>
          {projectKeys.map(key => recent[key] && (
            <div key={key} className="build-recent-entry">
              <div style={{ color: 'var(--text-dim)' }}>{projects[key].name}</div>
              <div style={{ color: 'var(--text-dim)', opacity: 0.6 }}>{recent[key].branch}{recent[key].tag ? ` · ${recent[key].tag}` : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Col 2: Form + Run history */}
      <div className="build-form">
        <div>
          <div className="build-form-title">{proj.name}</div>
          <div className="build-form-subtitle">Build & push a new image</div>
        </div>

        <div className="form-field">
          <label className="form-label">Branch</label>
          {loadingBranches
            ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Fetching branches…</span>
            : needsClone
              ? <button className="btn-primary" onClick={handleClone}>{'>> Clone Repository'}</button>
              : <SearchableSelect value={branch} options={branches} onChange={setBranch} />
          }
        </div>

        {params.map(p => (
          <ParamField key={p.name} param={p} value={form[p.name]} onChange={v => setField(p.name, v)} />
        ))}

        <button className="btn-build" onClick={handleBuild} disabled={!canBuild}>
          {'>> Build & Push'}
        </button>

        {runs.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="build-recent-label" style={{ marginBottom: 6 }}>Runs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {runs.map(run => {
                const queuedRuns = runs.filter(r => r.status === 'queued').sort((a, b) => a.id - b.id);
                const queuePos = run.status === 'queued' ? queuedRuns.findIndex(r => r.id === run.id) + 1 : null;
                return (
                  <button
                    key={run.id}
                    onClick={() => openRun(run)}
                    style={{
                      background: selectedRunId === run.id ? 'var(--surface-hover)' : 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      padding: '5px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ color: 'var(--text)', fontSize: 12 }}>
                      #{run.build_number} {run.type === 'clone' ? 'clone' : run.branch || ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: statusColor(run.status), fontSize: 11 }}>
                        {statusLabel(run.status)}
                      </span>
                      {queuePos !== null && (
                        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>pos {queuePos}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Col 3: Log output */}
      <div className="build-output">
        <div className="build-output-header">
          <span>{selectedRun ? `#${selectedRun.build_number} — ${selectedRun.type}` : 'Output'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSelectedActive && (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="status-dot running" />
                  <span style={{ color: 'var(--green)', letterSpacing: 0 }}>{selectedRun?.status}</span>
                </span>
                <button
                  onClick={handleCancel}
                  style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </>
            )}
            {liveStatus && !isSelectedActive && (
              <span style={{ color: statusColor(liveStatus), fontSize: 12 }}>{statusLabel(liveStatus)}</span>
            )}
            {selectedRun?.type === 'build' && !isSelectedActive && (
              <button
                onClick={handleReplay}
                style={{ background: 'rgba(122,162,247,0.12)', color: 'var(--blue)', border: '1px solid rgba(122,162,247,0.25)', borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
              >
                ↺ Replay
              </button>
            )}
          </div>
        </div>
        {selectedRun?.type === 'build' && (parsedParams.length > 0 || parsedCommits.length > 0) && (
          <div className="build-run-meta">
            {parsedParams.length > 0 && (
              <div className="build-meta-section">
                <div className="build-meta-label">Params</div>
                {parsedParams.map(({ label, value }) => (
                  <div key={label} className="build-meta-row">
                    <span className="build-meta-key">{label}</span>
                    <span className="build-meta-val">{value}</span>
                  </div>
                ))}
              </div>
            )}
            {parsedCommits.length > 0 && (
              <div className="build-meta-section">
                <div className="build-meta-label">Commits</div>
                {parsedCommits.map(c => (
                  <div key={c.hash} className="build-meta-commit">
                    <span className="build-meta-hash">{c.shortHash}</span>
                    <span className="build-meta-subject">{c.subject}</span>
                    <span className="build-meta-date">{c.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {stuckAlert && (
          <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '6px 12px', margin: '0 0 6px', color: 'var(--yellow, #f59e0b)', fontSize: 12 }}>
            ⚠ No output detected — this build may be stuck.
          </div>
        )}
        <div className="build-output-terminal" ref={outputRef}>
          {liveLog || <span style={{ color: 'var(--text-dim)' }}>Select a run to view output…</span>}
        </div>
      </div>
    </div>
  );
}

function ParamField({ param, value, onChange }) {
  const { type, label, name, options, required, placeholder, flag } = param;
  const labelText = `${label || name}${required ? ' *' : ''}`;
  if (type === 'string') return (
    <div className="form-field">
      <label className="form-label">{labelText}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} style={{ width: '100%' }} />
    </div>
  );
  if (type === 'select') return (
    <div className="form-field">
      <label className="form-label">{labelText}</label>
      <div className="pill-group">
        {(options || []).map(opt => (
          <button key={opt} className={`pill ${value === opt ? 'active' : ''}`} onClick={() => onChange(opt)}>{opt.toUpperCase()}</button>
        ))}
      </div>
    </div>
  );
  if (type === 'checkbox') return <Toggle label={`${label || name} (${flag})`} value={!!value} onChange={onChange} />;
  if (type === 'multiselect') return (
    <div className="form-field">
      <label className="form-label">{labelText}</label>
      <div className="pill-group" style={{ flexWrap: 'wrap' }}>
        {(options || []).map(opt => {
          const selected = Array.isArray(value) && value.includes(opt);
          return (
            <button key={opt} className={`pill ${selected ? 'active' : ''}`}
              onClick={() => onChange(selected ? value.filter(x => x !== opt) : [...(value || []), opt])}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
  return null;
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="toggle-row" onClick={() => onChange(!value)}>
      <div className={`toggle-track ${value ? 'on' : ''}`}><div className="toggle-thumb" /></div>
      <span>{label}</span>
    </div>
  );
}


