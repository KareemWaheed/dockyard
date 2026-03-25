import React, { useEffect, useState } from 'react';
import { fetchSettingsServers, createSettingsServer, updateSettingsServer, deleteSettingsServer } from '../../api';

const EMPTY_FORM = {
  env_key: '', name: '', host: '', ssh_username: '',
  auth_method: 'password', ssh_password: '', ssh_key_path: '', ssh_key_content: '',
  ssh_passphrase: '', docker_compose_cmd: 'docker compose',
  stacks: [{ name: '', path: '' }],
};

export default function ServersTab() {
  const [servers, setServers] = useState([]);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => fetchSettingsServers().then(setServers);
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_FORM, stacks: [{ name: '', path: '' }] }); };
  const openEdit = (s) => {
    setEditId(s.id);
    setForm({
      env_key: s.env_key, name: s.name, host: s.host, ssh_username: s.ssh_username,
      auth_method: s.ssh_password ? 'password' : s.ssh_key_content ? 'paste' : 'path',
      ssh_password: s.ssh_password || '', ssh_key_path: s.ssh_key_path || '',
      ssh_key_content: s.ssh_key_content || '', ssh_passphrase: s.ssh_passphrase || '',
      docker_compose_cmd: s.docker_compose_cmd || 'docker compose',
      stacks: s.stacks.length ? s.stacks.map(st => ({ name: st.name, path: st.path })) : [{ name: '', path: '' }],
    });
  };
  const cancel = () => setForm(null);

  const save = async () => {
    const body = {
      env_key: form.env_key, name: form.name, host: form.host, ssh_username: form.ssh_username,
      ssh_password: form.auth_method === 'password' ? form.ssh_password : null,
      ssh_key_path: form.auth_method === 'path' ? form.ssh_key_path : null,
      ssh_key_content: form.auth_method === 'paste' ? form.ssh_key_content : null,
      ssh_passphrase: form.auth_method !== 'password' ? form.ssh_passphrase : null,
      docker_compose_cmd: form.docker_compose_cmd,
      stacks: form.stacks.filter(s => s.name && s.path),
    };
    if (editId) await updateSettingsServer(editId, body);
    else await createSettingsServer(body);
    setForm(null);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this server?')) return;
    await deleteSettingsServer(id);
    load();
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setStack = (i, k, v) => setForm(f => {
    const stacks = [...f.stacks];
    stacks[i] = { ...stacks[i], [k]: v };
    return { ...f, stacks };
  });
  const addStack = () => setForm(f => ({ ...f, stacks: [...f.stacks, { name: '', path: '' }] }));
  const removeStack = (i) => setForm(f => ({ ...f, stacks: f.stacks.filter((_, idx) => idx !== i) }));

  return (
    <div className="settings-tab">
      <div className="settings-tab-header">
        <h3>Servers</h3>
        <button className="btn-primary" onClick={openAdd}>+ Add Server</button>
      </div>

      {servers.map(s => (
        <div key={s.id} className="settings-card">
          <div className="settings-card-row">
            <div>
              <span className="settings-env-badge">{s.env_key}</span>
              <span className="settings-card-name">{s.name}</span>
              <span className="settings-card-host">{s.host}</span>
            </div>
            <div className="settings-card-actions">
              <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                {expandedId === s.id ? '▲' : '▼'} Stacks
              </button>
              <button onClick={() => openEdit(s)}>Edit</button>
              <button className="btn-danger" onClick={() => remove(s.id)}>Delete</button>
            </div>
          </div>
          {expandedId === s.id && (
            <div className="settings-stacks">
              {s.stacks.map(st => (
                <div key={st.id} className="settings-stack-row">
                  <span>{st.name}</span>
                  <code>{st.path}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {form && (
        <div className="settings-modal-overlay">
          <div className="settings-modal">
            <h3>{editId ? 'Edit Server' : 'Add Server'}</h3>
            <label>Env Key <input value={form.env_key} onChange={e => setField('env_key', e.target.value)} disabled={!!editId} /></label>
            <label>Display Name <input value={form.name} onChange={e => setField('name', e.target.value)} /></label>
            <label>Host <input value={form.host} onChange={e => setField('host', e.target.value)} /></label>
            <label>SSH Username <input value={form.ssh_username} onChange={e => setField('ssh_username', e.target.value)} /></label>
            <label>Auth Method
              <select value={form.auth_method} onChange={e => setField('auth_method', e.target.value)}>
                <option value="password">Password</option>
                <option value="path">Key File Path</option>
                <option value="paste">Paste Key</option>
              </select>
            </label>
            {form.auth_method === 'password' && (
              <label>Password <input type="password" value={form.ssh_password} onChange={e => setField('ssh_password', e.target.value)} /></label>
            )}
            {form.auth_method === 'path' && (
              <label>Key Path <input value={form.ssh_key_path} onChange={e => setField('ssh_key_path', e.target.value)} /></label>
            )}
            {form.auth_method === 'paste' && (
              <label>Key Content <textarea rows={6} value={form.ssh_key_content} onChange={e => setField('ssh_key_content', e.target.value)} /></label>
            )}
            {form.auth_method !== 'password' && (
              <label>Passphrase <input type="password" value={form.ssh_passphrase} onChange={e => setField('ssh_passphrase', e.target.value)} /></label>
            )}
            <label>Docker Compose Command <input value={form.docker_compose_cmd} onChange={e => setField('docker_compose_cmd', e.target.value)} /></label>
            <div className="settings-stacks-editor">
              <div className="settings-stacks-header">
                <span>Compose Stacks</span>
                <button onClick={addStack}>+ Add Stack</button>
              </div>
              {form.stacks.map((st, i) => (
                <div key={i} className="settings-stack-input-row">
                  <input placeholder="Name (e.g. Main)" value={st.name} onChange={e => setStack(i, 'name', e.target.value)} />
                  <input placeholder="Path (e.g. /app/docker-compose.yml)" value={st.path} onChange={e => setStack(i, 'path', e.target.value)} />
                  <button onClick={() => removeStack(i)}>✕</button>
                </div>
              ))}
            </div>
            <div className="settings-modal-footer">
              <button onClick={cancel}>Cancel</button>
              <button className="btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
