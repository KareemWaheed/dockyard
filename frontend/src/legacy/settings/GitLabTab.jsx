import React, { useEffect, useState } from 'react';
import { fetchAppConfig, updateAppConfig } from '../../api';

export default function GitLabTab() {
  const [cfg, setCfg] = useState({ token: '', baseUrl: '', projects: {} });
  const [saved, setSaved] = useState(false);
  const [projectRows, setProjectRows] = useState([]);

  useEffect(() => {
    fetchAppConfig('gitlab').then(data => {
      setCfg(data);
      setProjectRows(Object.entries(data.projects || {}).map(([name, repo]) => ({ name, repo })));
    }).catch(() => {});
  }, []);

  const save = async () => {
    const projects = {};
    for (const row of projectRows) {
      if (row.name) projects[row.name] = row.repo;
    }
    await updateAppConfig('gitlab', { ...cfg, projects });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setRow = (i, k, v) => setProjectRows(rows => {
    const r = [...rows]; r[i] = { ...r[i], [k]: v }; return r;
  });

  return (
    <div className="settings-tab">
      <h3>GitLab</h3>
      <label>Token <input type="password" value={cfg.token} onChange={e => setCfg(c => ({ ...c, token: e.target.value }))} /></label>
      <label>Base URL <input value={cfg.baseUrl} onChange={e => setCfg(c => ({ ...c, baseUrl: e.target.value }))} /></label>
      <div className="settings-section-label">Projects (name → repo path)</div>
      {projectRows.map((row, i) => (
        <div key={i} className="settings-stack-input-row">
          <input placeholder="Project name" value={row.name} onChange={e => setRow(i, 'name', e.target.value)} />
          <input placeholder="repo/path" value={row.repo} onChange={e => setRow(i, 'repo', e.target.value)} />
          <button onClick={() => setProjectRows(r => r.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button onClick={() => setProjectRows(r => [...r, { name: '', repo: '' }])}>+ Add Project</button>
      <div className="settings-modal-footer">
        <button className="btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save'}</button>
      </div>
    </div>
  );
}
