import React, { useEffect, useState } from 'react';
import { fetchNotifications, createNotification, updateNotification, deleteNotification, testNotification } from '../../api';

const EMPTY_EMAIL = { host: '', port: 587, secure: false, user: '', pass: '', from: '', to: '' };
const EMPTY_WEBHOOK = { url: '', headers: {} };

export default function NotificationsTab() {
  const [notifiers, setNotifiers] = useState([]);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);

  const load = () => fetchNotifications().then(rows =>
    setNotifiers(rows.map(r => ({ ...r, config: JSON.parse(r.config_json), envs: r.envs_json ? JSON.parse(r.envs_json) : null })))
  );
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditId(null);
    setForm({ type: 'webhook', label: '', enabled: true, envs: '', config: { ...EMPTY_WEBHOOK } });
  };
  const openEdit = (n) => {
    setEditId(n.id);
    setForm({ type: n.type, label: n.label, enabled: !!n.enabled, envs: n.envs ? n.envs.join(',') : '', config: n.config });
  };
  const cancel = () => setForm(null);
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCfg = (k, v) => setForm(f => ({ ...f, config: { ...f.config, [k]: v } }));

  const save = async () => {
    const envs_json = form.envs.trim() ? form.envs.split(',').map(s => s.trim()).filter(Boolean) : null;
    const body = { type: form.type, label: form.label, config_json: form.config, enabled: form.enabled ? 1 : 0, envs_json };
    if (editId) await updateNotification(editId, body);
    else await createNotification(body);
    setForm(null);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this notifier?')) return;
    await deleteNotification(id);
    load();
  };

  const toggleEnabled = async (n) => {
    await updateNotification(n.id, { type: n.type, label: n.label, config_json: n.config, enabled: n.enabled ? 0 : 1, envs_json: n.envs });
    load();
  };

  return (
    <div className="settings-tab">
      <div className="settings-tab-header">
        <h3>Notifications</h3>
        <button className="btn-primary" onClick={openAdd}>+ Add Notifier</button>
      </div>

      {notifiers.map(n => (
        <div key={n.id} className="settings-card">
          <div className="settings-card-row">
            <div>
              <span className={`settings-type-badge ${n.type}`}>{n.type}</span>
              <span className="settings-card-name">{n.label}</span>
              {n.envs && <span className="settings-card-host">envs: {n.envs.join(', ')}</span>}
            </div>
            <div className="settings-card-actions">
              <label className="toggle">
                <input type="checkbox" checked={!!n.enabled} onChange={() => toggleEnabled(n)} />
                <span>Enabled</span>
              </label>
              <button onClick={() => testNotification(n.id).then(() => alert('Test sent!')).catch(e => alert('Failed: ' + e.message))}>Test</button>
              <button onClick={() => openEdit(n)}>Edit</button>
              <button className="btn-danger" onClick={() => remove(n.id)}>Delete</button>
            </div>
          </div>
        </div>
      ))}

      {form && (
        <div className="settings-modal-overlay">
          <div className="settings-modal">
            <h3>{editId ? 'Edit Notifier' : 'Add Notifier'}</h3>
            <label>Type
              <select value={form.type} onChange={e => { setField('type', e.target.value); setField('config', e.target.value === 'email' ? { ...EMPTY_EMAIL } : { ...EMPTY_WEBHOOK }); }}>
                <option value="webhook">Webhook</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label>Label <input value={form.label} onChange={e => setField('label', e.target.value)} /></label>
            <label>Environments (comma-separated, blank = all) <input value={form.envs} onChange={e => setField('envs', e.target.value)} placeholder="dev,stage,prod" /></label>
            {form.type === 'webhook' && (<>
              <label>URL <input value={form.config.url} onChange={e => setCfg('url', e.target.value)} /></label>
              <label>Authorization Header (optional) <input value={form.config.headers?.Authorization || ''} onChange={e => setCfg('headers', { Authorization: e.target.value })} /></label>
            </>)}
            {form.type === 'email' && (<>
              <label>SMTP Host <input value={form.config.host} onChange={e => setCfg('host', e.target.value)} /></label>
              <label>Port <input type="number" value={form.config.port} onChange={e => setCfg('port', Number(e.target.value))} /></label>
              <label><input type="checkbox" checked={form.config.secure} onChange={e => setCfg('secure', e.target.checked)} /> TLS (port 465)</label>
              <label>Username <input value={form.config.user} onChange={e => setCfg('user', e.target.value)} /></label>
              <label>Password <input type="password" value={form.config.pass} onChange={e => setCfg('pass', e.target.value)} /></label>
              <label>From <input value={form.config.from} onChange={e => setCfg('from', e.target.value)} /></label>
              <label>To <input value={form.config.to} onChange={e => setCfg('to', e.target.value)} /></label>
            </>)}
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
