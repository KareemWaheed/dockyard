import React, { useEffect, useState } from 'react';
import { fetchAppConfig, updateAppConfig } from '../../api';

const PARAM_TYPES = ['string', 'select', 'checkbox', 'multiselect'];

function emptyParam() {
  return { name: '', label: '', type: 'string', flag: '', required: false, default: '', placeholder: '', options: [] };
}

function emptyProject() {
  return { name: '', repo: '', buildScript: '', params: [] };
}

export default function BuildProjectsTab() {
  const [projects, setProjects] = useState({});
  const [keys, setKeys] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAppConfig('projects').then(data => {
      setProjects(data || {});
      const k = Object.keys(data || {});
      setKeys(k);
      if (k.length > 0) setActiveKey(k[0]);
    }).catch(() => {});
  }, []);

  const proj = activeKey ? projects[activeKey] : null;

  const updateProject = (field, value) => {
    setProjects(prev => ({
      ...prev,
      [activeKey]: { ...prev[activeKey], [field]: value },
    }));
  };

  const updateParam = (idx, field, value) => {
    const params = [...(proj.params || [])];
    params[idx] = { ...params[idx], [field]: value };
    updateProject('params', params);
  };

  const addParam = () => {
    updateProject('params', [...(proj.params || []), emptyParam()]);
  };

  const removeParam = (idx) => {
    updateProject('params', (proj.params || []).filter((_, i) => i !== idx));
  };

  const moveParam = (idx, dir) => {
    const params = [...(proj.params || [])];
    const target = idx + dir;
    if (target < 0 || target >= params.length) return;
    [params[idx], params[target]] = [params[target], params[idx]];
    updateProject('params', params);
  };

  const addProject = () => {
    const name = newKey.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    let key = slug;
    let i = 1;
    while (projects[key]) { key = `${slug}_${i++}`; }
    const updated = { ...projects, [key]: { ...emptyProject(), name } };
    setProjects(updated);
    setKeys(Object.keys(updated));
    setActiveKey(key);
    setNewKey('');
  };

  const removeProject = async () => {
    if (!activeKey || !confirm(`Delete "${proj.name || activeKey}"?`)) return;
    const updated = { ...projects };
    delete updated[activeKey];
    await updateAppConfig('projects', updated);
    setProjects(updated);
    const k = Object.keys(updated);
    setKeys(k);
    setActiveKey(k[0] || null);
  };

  const save = async () => {
    await updateAppConfig('projects', projects);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-tab">
      <h3>Build Projects</h3>

      {/* Project selector row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {keys.map(k => (
          <button key={k} className={`pill ${activeKey === k ? 'active' : ''}`} onClick={() => setActiveKey(k)}>
            {projects[k].name || k}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="New project name"
            style={{ width: 160 }}
            onKeyDown={e => e.key === 'Enter' && addProject()}
          />
          <button onClick={addProject} disabled={!newKey.trim()}>+</button>
        </div>
      </div>

      {proj && (
        <>
          {/* Project fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <label>Display Name<input value={proj.name} onChange={e => updateProject('name', e.target.value)} /></label>
              <label>Repository URL<input value={proj.repo || ''} onChange={e => updateProject('repo', e.target.value)} /></label>
              <label>Build Script<input value={proj.buildScript || ''} onChange={e => updateProject('buildScript', e.target.value)} placeholder="my-build.sh" /></label>
              <button onClick={removeProject} style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>Delete Project</button>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={!!proj.isFlyway}
                  onChange={e => updateProject('isFlyway', e.target.checked)}
                />
                Flyway project
              </label>
              {proj.isFlyway && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                  Flyway path (subdirectory for mvn):
                  <input
                    value={proj.flywayPath || ''}
                    onChange={e => updateProject('flywayPath', e.target.value)}
                    placeholder="e.g. Web/IrrigationApi"
                    style={{ flex: 1 }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Parameters */}
          <div className="settings-section-label" style={{ marginBottom: 8 }}>Parameters (rendered as form fields in Build view)</div>

          {(proj.params || []).map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, marginBottom: 8, background: 'var(--bg-card)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 80px', gap: 6, marginBottom: 6 }}>
                <input placeholder="name (key)" value={p.name} onChange={e => updateParam(i, 'name', e.target.value)} />
                <input placeholder="Label" value={p.label} onChange={e => updateParam(i, 'label', e.target.value)} />
                <select value={p.type} onChange={e => updateParam(i, 'type', e.target.value)}>
                  {PARAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="-flag" value={p.flag} onChange={e => updateParam(i, 'flag', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, alignItems: 'center' }}>
                <input placeholder="Default" value={p.type === 'multiselect' ? (p.default || []).join(', ') : (p.default || '')}
                  onChange={e => updateParam(i, 'default', p.type === 'multiselect' ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : e.target.value)} />
                <input placeholder="Placeholder" value={p.placeholder || ''} onChange={e => updateParam(i, 'placeholder', e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!p.required} onChange={e => updateParam(i, 'required', e.target.checked)} /> Required
                </label>
              </div>
              {(p.type === 'select' || p.type === 'multiselect') && (
                <div style={{ marginTop: 6 }}>
                  <input placeholder="Options (comma-separated)" value={(p.options || []).join(', ')}
                    onChange={e => updateParam(i, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => moveParam(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <button onClick={() => moveParam(i, 1)} disabled={i === (proj.params || []).length - 1} title="Move down">↓</button>
                <button onClick={() => removeParam(i)} title="Remove">✕</button>
              </div>
            </div>
          ))}

          <button onClick={addParam} style={{ marginTop: 4 }}>+ Add Parameter</button>
        </>
      )}

      <div className="settings-modal-footer">
        <button className="btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save'}</button>
      </div>
    </div>
  );
}
