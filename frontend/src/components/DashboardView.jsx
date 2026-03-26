import React, { useState } from 'react';
import { whitelistIp } from '../api';
import StackGroup from './StackGroup';
import ContainerRow from './ContainerRow';
import BulkActionBar from './BulkActionBar';

export default function DashboardView({ env, stacks, standalone, fetchError, lastRefresh, onRefresh, hasAwsSg }) {
  const [selected, setSelected] = useState(new Set());

  const isAwsEnv = hasAwsSg;
  const allContainers = stacks?.flatMap(s => s.containers) || [];
  const runningCount = allContainers.filter(c => c.status === 'running').length;
  const stoppedCount = allContainers.filter(c => c.status !== 'running').length;
  const selectedContainers = allContainers.filter(c => selected.has(c.name) && c.managed);

  const toggleSelect = (name) => setSelected(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const errorHint = fetchError
    ? (isAwsEnv ? 'Connection failed — try whitelisting your IP first' : 'Connection failed — check FortiClient VPN')
    : null;

  return (
    <>
      <div className="dashboard-statusbar">
        {!stacks && !fetchError && <span style={{ color: 'var(--text-dim)' }}>Connecting…</span>}
        {fetchError && <span style={{ color: 'var(--red)', fontSize: 11 }}>⚠ {errorHint}</span>}
        {stacks && !fetchError && (
          <>
            <span style={{ color: 'var(--green)', fontSize: 11 }}>● Connected</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{runningCount} running · {stoppedCount} stopped</span>
            {lastRefresh && <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>Refreshed {lastRefresh}</span>}
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {isAwsEnv && <WhitelistButton env={env} onSuccess={onRefresh} />}
        </div>
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          env={env}
          selected={selectedContainers}
          onClear={() => setSelected(new Set())}
          onDone={onRefresh}
        />
      )}

      <div className="dashboard-content">
        {stacks?.map((stack, idx) => (
          <StackGroup
            key={stack.path}
            env={env}
            stack={stack}
            stackIdx={idx}
            selected={selected}
            onToggle={toggleSelect}
            onRefresh={onRefresh}
          />
        ))}

        {standalone && standalone.length > 0 && (
          <div className="stack-group standalone-group">
            <div className="stack-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="stack-name">Standalone Containers</span>
                <span className="stack-count">{standalone.length} containers · {standalone.filter(c => c.status === 'running').length} running</span>
              </div>
            </div>
            <div>
              {standalone.map(c => (
                <ContainerRow
                  key={c.name}
                  env={env}
                  container={c}
                  stackPath={null}
                  checked={false}
                  onToggle={() => {}}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function WhitelistButton({ env, onSuccess }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [show, setShow] = useState(false);

  const run = async () => {
    setRunning(true); setOutput(''); setShow(true);
    await whitelistIp(env, (chunk) => setOutput(o => o + chunk), (code) => {
      setRunning(false);
      if (code === 0) setTimeout(onSuccess, 4000);
    });
  };

  return (
    <>
      <button onClick={run} disabled={running} className="btn" style={{ color: 'var(--purple)', fontSize: 10 }}>
        {running ? 'Whitelisting…' : '>> Whitelist My IP'}
      </button>
      {show && (
        <div className="modal-backdrop" onClick={() => { if (!running) setShow(false); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <pre style={{ overflow: 'auto', maxHeight: '50vh', color: 'var(--green)', fontSize: 11 }}>{output}</pre>
            <button onClick={() => setShow(false)} disabled={running} className="btn" style={{ marginTop: 10 }}>
              {running ? 'Running…' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
