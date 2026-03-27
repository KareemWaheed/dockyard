import React, { useState } from 'react';
import { containerAction, saveNote } from '../api';
import LogsPanel from './LogsPanel';
import EnvPanel from './EnvPanel';
import UpdateTagModal from './UpdateTagModal';

export default function ContainerRow({ env, container, stackPath, checked, onToggle, onRefresh }) {
  const { name, status, image, managed, note } = container;
  const [localNote, setLocalNote] = useState(note || '');
  const [logsOpen, setLogsOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const serviceName = container.serviceName || name;

  const act = async (action, body = {}) => {
    setBusy(true);
    try {
      await containerAction(env, name, action, { stackPath, serviceName, stackName: container.stackName || '', ...body });
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const toggleManaged = async (enabled) => {
    const password = window.prompt(enabled
      ? 'Enter the managed password to add the label'
      : 'Enter the managed password to remove the label');
    if (password === null) return;
    await act('toggle-managed', { enabled, password });
  };

  const imageTag = image?.split(':').pop() || '';
  const imageBase = image?.split(':')[0]?.split('/').pop() || '';

  const containerId = name.replace(/^\//, '');

  return (
    <div
      id={containerId}
      className={`container-row ${managed ? 'managed' : 'unmanaged'}`}
    >
      {managed
        ? <input type="checkbox" checked={checked} onChange={onToggle} style={{ flexShrink: 0 }} />
        : <span style={{ width: 16 }} />}

      <span className={`container-status-dot ${status === 'running' ? 'running' : 'stopped'}`} />

      <span className="container-name" title={name}>{name}</span>

      <span className="container-image" title={image}>
        {imageBase}:<b style={{ color: status === 'running' ? 'var(--green)' : 'var(--red)' }}>{imageTag}</b>
      </span>

      <input
        className="container-note"
        value={localNote}
        onChange={e => setLocalNote(e.target.value)}
        onBlur={() => saveNote(env, name, localNote)}
        placeholder="notes…"
      />

      <div className="container-actions">
        {managed && <>
          <ActionBtn color="var(--green)"  title="Update image tag"        onClick={() => setTagOpen(true)}                        disabled={busy}>Tag</ActionBtn>
          <ActionBtn color="var(--blue)"   title="View / edit env vars"    onClick={() => setEnvOpen(true)}                        disabled={busy}>Env</ActionBtn>
          {stackPath && <ActionBtn color="var(--orange)" title="Remove managed label" onClick={() => toggleManaged(false)} disabled={busy}>Unmanage</ActionBtn>}
          <ActionBtn color="var(--yellow)" title="Restart container"       onClick={() => act('restart')}                          disabled={busy}>↻</ActionBtn>
          <ActionBtn color="var(--indigo)" title="docker compose up -d"    onClick={() => act('up')}                               disabled={busy}>▶</ActionBtn>
          <ActionBtn color="var(--orange)" title="Force recreate"          onClick={() => act('up', { forceRecreate: true })}       disabled={busy}>⚡</ActionBtn>
          <ActionBtn color="var(--purple)" title="Pull &amp; recreate (fetch latest image)" onClick={() => act('pull-recreate')} disabled={busy}><span style={{ fontSize: 15 }}>⤓</span></ActionBtn>
          <ActionBtn color="var(--red)"    title="Stop container"          onClick={() => act('stop')}                              disabled={busy}>■</ActionBtn>
        </>}
        {!managed && (
          <>
            <ActionBtn color="var(--blue)" title="View env vars (read-only)" onClick={() => setEnvOpen(true)} disabled={busy}>Env</ActionBtn>
            {stackPath && <ActionBtn color="var(--green)" title="Add managed label" onClick={() => toggleManaged(true)} disabled={busy}>Manage</ActionBtn>}
          </>
        )}
        <ActionBtn color="var(--purple)" title="View live logs" onClick={() => setLogsOpen(true)} disabled={busy}>Logs</ActionBtn>
      </div>

      {logsOpen && <LogsPanel env={env} container={name} onClose={() => setLogsOpen(false)} />}
      {envOpen  && <EnvPanel  env={env} container={container} stackPath={stackPath} onClose={() => setEnvOpen(false)}  onDone={onRefresh} />}
      {tagOpen  && <UpdateTagModal env={env} container={container} stackPath={stackPath} onClose={() => setTagOpen(false)} onDone={onRefresh} />}
    </div>
  );
}

function ActionBtn({ color, title, onClick, disabled, children }) {
  return (
    <button
      className="btn-action"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ color }}
    >
      {children}
    </button>
  );
}
