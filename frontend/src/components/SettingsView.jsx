import React, { useState } from 'react';
import ServersTab from './settings/ServersTab';
import NotificationsTab from './settings/NotificationsTab';
import GitLabTab from './settings/GitLabTab';
import AwsTab from './settings/AwsTab';
import BuildProjectsTab from './settings/BuildProjectsTab';

const TABS = [
  { id: 'servers', label: 'Servers', Component: ServersTab },
  { id: 'notifications', label: 'Notifications', Component: NotificationsTab },
  { id: 'gitlab', label: 'GitLab', Component: GitLabTab },
  { id: 'aws', label: 'AWS', Component: AwsTab },
  { id: 'buildProjects', label: 'Build Projects', Component: BuildProjectsTab },
];

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState('servers');
  const { Component } = TABS.find(t => t.id === activeTab);

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
    </div>
  );
}
