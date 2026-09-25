// frontend/src/components/settings/FlywayTab.jsx
import React, { useEffect, useState } from 'react';
import {
  fetchFlywayEnvs,
  createFlywayEnv, updateFlywayEnv, deleteFlywayEnv,
  createFlywayDatabase, updateFlywayDatabase, deleteFlywayDatabase,
} from '../../api';

const EMPTY_ENV = { name: '', description: '' };
const EMPTY_DB = {
  name: '', url: '', db_user: '', db_password: '',
  schemas: '', locations: 'filesystem:src/main/resources/db/migration/',
  baseline_on_migrate: true, baseline_version: '1',
};

export default function FlywayTab() {
  const [envs, setEnvs] = useState([]);
  const [expandedEnvId, setExpandedEnvId] = useState(null);
  const [envForm, setEnvForm] = useState(null);
  const [editEnvId, setEditEnvId] = useState(null);
  const [dbForm, setDbForm] = useState(null);
  const [editDbId, setEditDbId] = useState(null);
  const [dbEnvId, setDbEnvId] = useState(null);

  const load = () => fetchFlywayEnvs().then(setEnvs).catch(() => {});
  useEffect(() => { load(); }, []);

  // ── Env CRUD ──
  const openAddEnv = () => { setEditEnvId(null); setEnvForm({ ...EMPTY_ENV }); };
  const openEditEnv = (e) => { setEditEnvId(e.id); setEnvForm({ name: e.name, description: e.description || '' }); };
  const cancelEnv = () => setEnvForm(null);

  const saveEnv = async () => {
    if (!envForm.name.trim()) return;
    if (editEnvId) await updateFlywayEnv(editEnvId, envForm);
    else await createFlywayEnv(envForm);
    setEnvForm(null);
    load();
  };

  const removeEnv = async (id) => {
    if (!window.confirm('Delete this environment and all its databases?')) return;
    await deleteFlywayEnv(id);
    load();
  };

  // ── DB CRUD ──
  const openAddDb = (envId) => { setEditDbId(null); setDbEnvId(envId); setDbForm({ ...EMPTY_DB }); };
  const openEditDb = (d, envId) => {
    setEditDbId(d.id);
    setDbEnvId(envId);
    setDbForm({
      name: d.name, url: d.url, db_user: d.db_user, db_password: '',
      schemas: d.schemas, locations: d.locations || 'filesystem:src/main/resources/db/migration/',
      baseline_on_migrate: !!d.baseline_on_migrate, baseline_version: d.baseline_version,
    });
  };
  const cancelDb = () => setDbForm(null);

  const saveDb = async () => {
    const { name, url, db_user, db_password, schemas } = dbForm;
    if (!name || !url || !db_user || !schemas) { alert('Name, URL, username and schemas are required'); return; }
    if (editDbId) {
      await updateFlywayDatabase(editDbId, dbForm);
    } else {
      if (!db_password) { alert('Password required for new database'); return; }
      await createFlywayDatabase(dbEnvId, dbForm);
    }
    setDbForm(null);
    load();
  };

  const removeDb = async (id) => {
    if (!window.confirm('Remove this database config?')) return;
    await deleteFlywayDatabase(id);
    load();
  };

  const setDbField = (k, v) => setDbForm(f => ({ ...f, [k]: v }));

  return (
    <div className="settings-tab">
      <div className="settings-tab-header">
        <h3>Flyway Environments</h3>
        <button className="btn-primary" onClick={openAddEnv}>+ Add Environment</button>
      </div>

      {/* Env form */}
      {envForm && (
        <div className="settings-card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
            <label>Name *
              <input value={envForm.name} onChange={e => setEnvForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Test" />
            </label>
            <label>Description
              <input value={envForm.description} onChange={e => setEnvForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-primary" onClick={saveEnv}>Save</button>
            <button onClick={cancelEnv}>Cancel</button>
          </div>
        </div>
      )}

      {envs.length === 0 && !envForm && (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No environments yet. Add one to get started.</div>
      )}

      {envs.map(env => (
        <div key={env.id} className="settings-card" style={{ marginBottom: 8 }}>
          <div className="settings-card-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }}
                onClick={() => setExpandedEnvId(id => id === env.id ? null : env.id)}
              >
                {expandedEnvId === env.id ? '▼' : '▶'}
              </button>
              <span className="settings-card-name">{env.name}</span>
              {env.description && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{env.description}</span>}
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{env.databases.length} db{env.databases.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEditEnv(env)}>Edit</button>
              <button onClick={() => removeEnv(env.id)} style={{ color: 'var(--red)' }}>Delete</button>
            </div>
          </div>

          {expandedEnvId === env.id && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              {env.databases.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(169,177,214,0.06)' }}>
                  <div style={{ fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{d.name}</span>
                    <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>{d.url}</span>
                    <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>schemas: {d.schemas}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openEditDb(d, env.id)}>Edit</button>
                    <button onClick={() => removeDb(d.id)} style={{ color: 'var(--red)' }}>Delete</button>
                  </div>
                </div>
              ))}

              {/* DB form */}
              {dbForm && dbEnvId === env.id ? (
                <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-card)', borderRadius: 4, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 6, marginBottom: 6 }}>
                    <label>Name *<input value={dbForm.name} onChange={e => setDbField('name', e.target.value)} placeholder="irrigation_db" /></label>
                    <label>JDBC URL *<input value={dbForm.url} onChange={e => setDbField('url', e.target.value)} placeholder="jdbc:postgresql://10.0.30.27:5432/irrigation_db" /></label>
                    <label>Schemas *<input value={dbForm.schemas} onChange={e => setDbField('schemas', e.target.value)} placeholder="new_test" /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                    <label>Username *<input value={dbForm.db_user} onChange={e => setDbField('db_user', e.target.value)} placeholder="postgres" /></label>
                    <label>Password {editDbId ? '(leave blank to keep)' : '*'}<input type="password" value={dbForm.db_password} onChange={e => setDbField('db_password', e.target.value)} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <label>Locations<input value={dbForm.locations} onChange={e => setDbField('locations', e.target.value)} /></label>
                    <label>Baseline Version<input value={dbForm.baseline_version} onChange={e => setDbField('baseline_version', e.target.value)} /></label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 16 }}>
                      <input type="checkbox" checked={dbForm.baseline_on_migrate} onChange={e => setDbField('baseline_on_migrate', e.target.checked)} />
                      baselineOnMigrate
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" onClick={saveDb}>Save</button>
                    <button onClick={cancelDb}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button style={{ marginTop: 8, fontSize: 11 }} onClick={() => openAddDb(env.id)}>+ Add Database</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
