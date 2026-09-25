// frontend/src/components/settings/VpnTab.jsx
import React, { useEffect, useState } from 'react';
import { getVpnStatus, vpnAction } from '../../api';

export default function VpnTab() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [output, setOutput] = useState('');

  const refresh = () => getVpnStatus().then(d => setStatus(d.status)).catch(() => setStatus('unknown'));
  useEffect(() => { refresh(); }, []);

  const run = async (action) => {
    if (action === 'stop' && !window.confirm('Stop the FortiVPN service? VPN-gated environments will be unreachable from the dashboard until it is started again.')) return;
    setBusy(action); setOutput('');
    await vpnAction(action, (chunk) => setOutput(o => o + chunk), (code) => {
      setOutput(o => o + (code === 0 ? '\n✓ Done' : `\n✗ Exited with code ${code}`));
      setBusy(null);
      setTimeout(refresh, 1500);
    });
  };

  const statusColor = status === 'active' ? 'var(--green)'
    : status === null || status === 'unknown' ? 'var(--text-dim)'
    : 'var(--red)';

  return (
    <div className="settings-tab">
      <div className="settings-tab-header">
        <h3>FortiVPN Service</h3>
      </div>
      <div className="settings-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ color: statusColor, fontSize: 12, fontWeight: 600 }}>● {status || 'checking…'}</span>
          <button onClick={refresh} disabled={!!busy} style={{ fontSize: 11 }}>Refresh</button>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 12 }}>
          Controls the fortivpn service on the dashboard host. Stop it to free the VPN for
          your local machine, then start it again when you're done.
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-primary" onClick={() => run('start')} disabled={!!busy}>
            {busy === 'start' ? 'Starting…' : 'Start'}
          </button>
          <button onClick={() => run('stop')} disabled={!!busy} style={{ color: 'var(--red)' }}>
            {busy === 'stop' ? 'Stopping…' : 'Stop'}
          </button>
          <button onClick={() => run('restart')} disabled={!!busy} style={{ color: 'var(--yellow)' }}>
            {busy === 'restart' ? 'Restarting…' : 'Restart'}
          </button>
        </div>
        {output && (
          <pre style={{ marginTop: 12, overflow: 'auto', maxHeight: '40vh', color: 'var(--green)', fontSize: 11 }}>{output}</pre>
        )}
      </div>
    </div>
  );
}
