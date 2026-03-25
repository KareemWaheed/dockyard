import React, { useState, useEffect } from 'react';
import { fetchHistory } from '../api';

const ENVS = ['all', 'dev', 'test', 'stage', 'prod'];

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HistoryView() {
  const [activeEnv, setActiveEnv] = useState('all');
  const [containerFilter, setContainerFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const env = activeEnv === 'all' ? undefined : activeEnv;
    const filter = containerFilter.trim() || undefined;
    fetchHistory(env, { container: filter })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [activeEnv, containerFilter]);

  return (
    <div className="history-view">
      <div className="history-header">
        <h2>Deployment History</h2>
        <div className="history-filters">
          <div className="env-tabs">
            {ENVS.map(e => (
              <button
                key={e}
                className={`env-tab ${activeEnv === e ? 'active' : ''}`}
                onClick={() => setActiveEnv(e)}
              >
                {e.toUpperCase()}
              </button>
            ))}
          </div>
          <input
            className="history-search"
            placeholder="Filter by container..."
            value={containerFilter}
            onChange={e => setContainerFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="history-empty">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="history-empty">No deployments found.</div>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Env</th>
              <th>Container</th>
              <th>Action</th>
              <th>Tag Change</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <React.Fragment key={row.id}>
                <tr
                  className={`history-row ${row.success ? '' : 'history-row-failed'}`}
                  onClick={() => !row.success && setExpandedId(expandedId === row.id ? null : row.id)}
                  style={{ cursor: row.success ? 'default' : 'pointer' }}
                >
                  <td title={row.timestamp}>{timeAgo(row.timestamp)}</td>
                  <td>{row.env}</td>
                  <td>{row.container_name}</td>
                  <td>{row.action}</td>
                  <td>
                    {row.old_tag && row.new_tag
                      ? `${row.old_tag} → ${row.new_tag}`
                      : '—'}
                  </td>
                  <td>{row.success ? '✓' : '✗'}</td>
                  <td>{row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
                {expandedId === row.id && row.error_message && (
                  <tr className="history-row-error">
                    <td colSpan={7}>
                      <pre>{row.error_message}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
