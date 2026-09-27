// Pure helpers for the build form and for reading finished runs. Ported from legacy/BuildView.jsx.

export function initFormState(params = [], saved = {}) {
  const state = {};
  for (const p of params) {
    if (p.type === 'multiselect') state[p.name] = p.default || [];
    else if (p.type === 'checkbox') state[p.name] = p.default || false;
    else state[p.name] = p.default || '';
    if (saved && Object.prototype.hasOwnProperty.call(saved, p.name)) state[p.name] = saved[p.name];
  }
  return state;
}

export function buildArgs(params = [], values = {}) {
  const args = [];
  for (const p of params) {
    const val = values[p.name];
    if (p.type === 'checkbox') {
      if (val) args.push(p.flag);
    } else if (p.type === 'multiselect') {
      if (Array.isArray(val)) val.forEach((item) => args.push(p.flag, item));
    } else if (val) {
      args.push(p.flag, val);
    }
  }
  return args;
}

export function isFormValid(params = [], values = {}, branch = '') {
  if (!branch) return false;
  return params.every((p) => {
    if (!p.required || p.type === 'checkbox') return true;
    const val = values[p.name];
    return p.type === 'multiselect' ? Array.isArray(val) && val.length > 0 : !!val;
  });
}

function parseJson(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonArray(s) {
  const v = parseJson(s, []);
  return Array.isArray(v) ? v : [];
}

export function parseArgs(params, argsJson, branch) {
  if (!params) return [];
  const args = parseJsonArray(argsJson);
  const rows = [];
  if (branch) rows.push({ label: 'Branch', value: branch });
  for (const p of params) {
    const label = p.label || p.name;
    if (p.type === 'checkbox') {
      rows.push({ label, value: args.includes(p.flag) ? 'yes' : 'no' });
    } else if (p.type === 'multiselect') {
      const vals = args.filter((a, i) => i > 0 && args[i - 1] === p.flag);
      if (vals.length) rows.push({ label, value: vals.join(', ') });
    } else {
      const i = args.indexOf(p.flag);
      if (i !== -1 && i + 1 < args.length) rows.push({ label, value: args[i + 1] });
    }
  }
  return rows;
}

function deployArgs(run) {
  const a = parseJson(run?.args_json, null);
  return a && typeof a === 'object' && !Array.isArray(a) ? a : null;
}

export function parseDeployMeta(run) {
  if (run?.type !== 'deploy') return [];
  const a = deployArgs(run);
  if (!a) return [];
  return [
    a.sourceBuildNumber && { label: 'From build', value: `#${a.sourceBuildNumber}` },
    run.branch && { label: 'Branch', value: run.branch },
    a.gitHash && { label: 'Git hash', value: String(a.gitHash).slice(0, 9) },
    a.image && { label: 'Image', value: a.image },
    a.env && { label: 'Environment', value: a.env },
    a.app && { label: 'CapRover app', value: a.app },
  ].filter(Boolean);
}

export function deployEnvOf(run) {
  if (run?.type !== 'deploy') return '';
  return deployArgs(run)?.env || '';
}
