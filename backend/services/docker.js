function parseComposePs(output) {
  // docker compose ps --format json outputs NDJSON (one JSON object per line)
  // but some versions output a JSON array — handle both
  output = output.trim();
  if (!output) return [];

  let items;
  if (output.startsWith('[')) {
    items = JSON.parse(output);
  } else {
    items = output.split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  return items.map(item => ({
    name: item.Name || item.Service,
    status: (item.State || item.Status || '').toLowerCase().includes('running') ? 'running' : 'stopped',
    image: item.Image || '',
  }));
}

function parseInspect(output) {
  const data = JSON.parse(output);
  const item = Array.isArray(data) ? data[0] : data;
  const labels = item.Config?.Labels || {};
  const envArr = item.Config?.Env || [];

  const env = {};
  for (const e of envArr) {
    const idx = e.indexOf('=');
    if (idx > -1) env[e.slice(0, idx)] = e.slice(idx + 1);
  }

  return {
    image: item.Config?.Image || '',
    managed: labels['com.namaa.dashboard.managed'] === 'true',
    env,
    status: (item.State?.Status || '').toLowerCase().includes('running') ? 'running' : 'stopped',
    labels,
  };
}

function parseBatchInspect(output) {
  const items = JSON.parse(output);
  const map = {};
  for (const item of items) {
    const name = (item.Name || '').replace(/^\//, '');
    if (!name) continue;
    const labels = item.Config?.Labels || {};
    const envArr = item.Config?.Env || [];
    const env = {};
    for (const e of envArr) {
      const idx = e.indexOf('=');
      if (idx > -1) env[e.slice(0, idx)] = e.slice(idx + 1);
    }
    map[name] = {
      image: item.Config?.Image || '',
      managed: labels['com.dockyard.managed'] === 'true',
      env,
      status: (item.State?.Status || '').toLowerCase().includes('running') ? 'running' : 'stopped',
      labels,
    };
  }
  return map;
}

module.exports = { parseComposePs, parseInspect, parseBatchInspect };
