import React, { useState, useEffect, useRef } from 'react';
import { fetchProjects, fetchBranches, startBuild, cloneRepo } from '../api';

const RECENT_KEY = 'namaa_build_recent';

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
    if (p.type === 'checkbox') {
      if (val) args.push(p.flag);
    } else if (p.type === 'multiselect') {
      if (Array.isArray(val)) val.forEach(item => args.push(p.flag, item));
    } else {
      if (val) args.push(p.flag, val);
    }
  }
  return args;
}

function isFormValid(params, formValues, branch) {
  if (!branch) return false;
  for (const p of params) {
    if (!p.required) continue;
    const val = formValues[p.name];
    if (p.type === 'multiselect') { if (!val || val.length === 0) return false; }
    else if (p.type === 'checkbox') { /* checkboxes are always valid */ }
    else { if (!val) return false; }
  }
  return true;
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
  const [cloning, setCloning] = useState(false);
  const [output, setOutput] = useState('');
  const [building, setBuilding] = useState(false);
  const [exitCode, setExitCode] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const [loading, setLoading] = useState(true);
  const outputRef = useRef(null);

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

  const proj = activeProject ? projects[activeProject] : null;
  const params = proj?.params || [];
  const form = formStates[activeProject] || {};
  const branch = branchStates[activeProject] || '';

  const setField = (key, value) => {
    setFormStates(prev => ({
      ...prev,
      [activeProject]: { ...prev[activeProject], [key]: value },
    }));
  };

  const setBranch = (value) => {
    setBranchStates(prev => ({ ...prev, [activeProject]: value }));
  };

  const loadBranchList = () => {
    if (!activeProject) return;
    setLoadingBranches(true); setNeedsClone(false);
    fetchBranches(activeProject)
      .then(r => {
        setNeedsClone(!!r.needsClone);
        setBranches(r.branches);
        if (!branch) setBranch(r.branches[0] || '');
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));
  };

  useEffect(() => { if (activeProject) loadBranchList(); }, [activeProject]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const args = buildArgs(params, form);
  const canBuild = !building && !cloning && !needsClone && isFormValid(params, form, branch);
  const commandPreview = branch && proj?.buildScript ? `bash scripts/${proj.buildScript} ${args.join(' ')}` : null;

  const clone = async () => {
    setOutput(''); setExitCode(null); setCloning(true);
    await cloneRepo(activeProject, c => setOutput(o => o + c), code => {
      setCloning(false); setExitCode(code);
      if (code === 0) loadBranchList();
    });
  };

  const build = async () => {
    if (!canBuild) return;
    setOutput(''); setExitCode(null); setBuilding(true);
    saveRecent(activeProject, { branch, ...form });
    setRecent(loadRecent());
    await startBuild(activeProject, branch, args, c => setOutput(o => o + c), code => {
      setExitCode(code); setBuilding(false);
    });
  };

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

      {/* Col 2: Form */}
      <div className="build-form">
        <div>
          <div className="build-form-title">{proj.name}</div>
          <div className="build-form-subtitle">Build & push a new image</div>
        </div>

        {/* Branch (always present) */}
        <div className="form-field">
          <label className="form-label">Branch</label>
          {loadingBranches
            ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Fetching branches…</span>
            : needsClone
              ? <button className="btn-primary" onClick={clone} disabled={cloning}>
                  {cloning ? 'Cloning…' : '>> Clone Repository'}
                </button>
              : <SearchableSelect value={branch} options={branches} onChange={setBranch} />
          }
        </div>

        {/* Dynamic params */}
        {params.map(p => (
          <ParamField key={p.name} param={p} value={form[p.name]} onChange={v => setField(p.name, v)} />
        ))}

        {/* Command preview */}
        {commandPreview && (
          <div className="command-preview">
            <div className="command-preview-label">Command</div>
            <div className="command-preview-text">{commandPreview}</div>
          </div>
        )}

        {/* Build button */}
        <button className="btn-build" onClick={build} disabled={!canBuild}>
          {building ? 'Building…' : cloning ? 'Cloning…' : '>> Build & Push'}
        </button>
      </div>

      {/* Col 3: Output */}
      <div className="build-output">
        <div className="build-output-header">
          <span>Output</span>
          {building && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="status-dot running" />
            <span style={{ color: 'var(--green)', letterSpacing: 0 }}>running</span>
          </span>}
        </div>
        <div className="build-output-terminal" ref={outputRef}>
          {output || <span style={{ color: 'var(--text-dim)' }}>Output will appear here…</span>}
          {exitCode !== null && (
            <div style={{ color: exitCode === 0 ? 'var(--green)' : 'var(--red)', fontWeight: 'bold', marginTop: 8 }}>
              {exitCode === 0 ? '✓ Build succeeded' : `✗ Build failed (exit ${exitCode})`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParamField({ param, value, onChange }) {
  const { type, label, name, options, required, placeholder, flag } = param;
  const labelText = `${label || name}${required ? ' *' : ''}`;

  if (type === 'string') {
    return (
      <div className="form-field">
        <label className="form-label">{labelText}</label>
        <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} style={{ width: '100%' }} />
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div className="form-field">
        <label className="form-label">{labelText}</label>
        <div className="pill-group">
          {(options || []).map(opt => (
            <button key={opt} className={`pill ${value === opt ? 'active' : ''}`} onClick={() => onChange(opt)}>
              {opt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'checkbox') {
    return <Toggle label={`${label || name} (${flag})`} value={!!value} onChange={onChange} />;
  }

  if (type === 'multiselect') {
    return (
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
  }

  return null;
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="toggle-row" onClick={() => onChange(!value)}>
      <div className={`toggle-track ${value ? 'on' : ''}`}>
        <div className="toggle-thumb" />
      </div>
      <span>{label}</span>
    </div>
  );
}

function SearchableSelect({ value, options, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const select = opt => { onChange(opt); setSearch(''); setOpen(false); };

  return (
    <div className="searchable-select" ref={ref}>
      <input
        className="searchable-select-input"
        value={open ? search : value}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setSearch(''); setOpen(true); }}
        placeholder="Search branch…"
      />
      {open && filtered.length > 0 && (
        <div className="searchable-select-dropdown">
          {filtered.map(o => (
            <div key={o} className={`searchable-select-option ${o === value ? 'selected' : ''}`} onMouseDown={() => select(o)}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}
