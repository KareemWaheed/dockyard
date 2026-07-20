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
    serviceName: item.Service || item.Name,
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

// Normalizes a Java .properties-style git.properties file or a build-info.json
// file into a common shape for display.
function parseVersionInfo(raw, format) {
  if (format === 'json') {
    const data = JSON.parse(raw);
    return {
      version: data.version || '',
      commit: data.commit || '',
      shortCommit: data.shortCommit || (data.commit ? data.commit.slice(0, 7) : ''),
      branch: data.branch || '',
      dirty: !!data.dirty,
      buildTime: data.buildTime || '',
    };
  }

  const props = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    props[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/\\(.)/g, '$1');
  }
  const commit = props['git.commit.id'] || '';
  return {
    version: (props['git.tags'] || '').replace(/^v/, ''),
    commit,
    shortCommit: props['git.commit.id.abbrev'] || commit.slice(0, 7),
    branch: props['git.branch'] || '',
    dirty: props['git.dirty'] === 'true',
    buildTime: props['git.build.time'] || '',
  };
}

module.exports = { parseComposePs, parseInspect, parseBatchInspect, parseVersionInfo };
