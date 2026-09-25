import React, { useEffect, useState } from 'react';
import { fetchAppConfig, updateAppConfig } from '../../api';

export default function AwsTab() {
  const [cfg, setCfg] = useState({ region: '', description: '', accessKeyId: '', secretAccessKey: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAppConfig('awsSg').then(setCfg).catch(() => {});
  }, []);

  const save = async () => {
    await updateAppConfig('awsSg', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-tab">
      <h3>AWS Security Group</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>AWS credentials used for Security Group whitelisting. Set the Security Group ID per server in Settings → Servers.</p>
      <label>Your Name / Description <input placeholder="e.g. Kareem" value={cfg.description || ''} onChange={e => setCfg(c => ({ ...c, description: e.target.value }))} /></label>
      <label>Region <input value={cfg.region} onChange={e => setCfg(c => ({ ...c, region: e.target.value }))} /></label>
      <label>Access Key ID <input value={cfg.accessKeyId || ''} onChange={e => setCfg(c => ({ ...c, accessKeyId: e.target.value }))} /></label>
      <label>Secret Access Key <input type="password" value={cfg.secretAccessKey || ''} onChange={e => setCfg(c => ({ ...c, secretAccessKey: e.target.value }))} /></label>
      <div className="settings-modal-footer">
        <button className="btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save'}</button>
      </div>
    </div>
  );
}
