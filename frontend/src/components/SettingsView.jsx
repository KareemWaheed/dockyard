import React, { useRef, useState } from 'react';
import ServersTab from './settings/ServersTab';
import NotificationsTab from './settings/NotificationsTab';
import GitLabTab from './settings/GitLabTab';
import AwsTab from './settings/AwsTab';
import BuildProjectsTab from './settings/BuildProjectsTab';
import FlywayTab from './settings/FlywayTab';
import { exportSettings, importSettings } from '../api';

const TABS = [
  { id: 'servers', label: 'Servers', Component: ServersTab },
  { id: 'notifications', label: 'Notifications', Component: NotificationsTab },
  { id: 'gitlab', label: 'GitLab', Component: GitLabTab },
  { id: 'aws', label: 'AWS', Component: AwsTab },
  { id: 'buildProjects', label: 'Build Projects', Component: BuildProjectsTab },
  { id: 'flyway', label: 'Flyway', Component: FlywayTab },
];

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState('servers');
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const { Component } = TABS.find(t => t.id === activeTab);

  async function handleExport() {
    const data = await exportSettings();
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `namaa-config-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    setImportError(null);
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setImportError('Invalid JSON file.');
      return;
    }

    if (!window.confirm('This will replace all current settings. Continue?')) return;

    setImporting(true);
    setImportError(null);
    try {
      await importSettings(payload);
      window.location.reload();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="settings-view">
      <div className="settings-view-header">
        <h2>Settings</h2>
        <div className="settings-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`settings-tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-tab-content">
        <Component />
      </div>
      <div className="backup-restore-section">
        <h3>Backup &amp; Restore</h3>
        <p>Export all settings to a file or import a previously exported file to replace current settings.</p>
        <div className="backup-restore-actions">
          <button className="btn-primary" onClick={handleExport}>Export Settings</button>
          <button className="btn-primary" onClick={handleImportClick} disabled={importing}>
            {importing ? 'Importing…' : 'Import Settings'}
          </button>
        </div>
        {importError && <p className="backup-restore-error">{importError}</p>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
