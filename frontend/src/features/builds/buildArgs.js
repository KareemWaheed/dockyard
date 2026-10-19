// Pure helpers for the build form and for reading finished runs. Ported from the pre-rebuild Builds page.

// List-valued params. 'tags' is free-form image tags, passed to build scripts as ONE
// comma-separated value (-t stage-latest,prod-latest) — unlike multiselect, which repeats the flag.
const isList = (type) => type === 'multiselect' || type === 'tags';
const splitTags = (v) => String(v).split(',').filter(Boolean);
// Values saved before a param became 'tags' (or a comma-separated default) may be a plain string.
const toList = (type, v) => {
  const list = [].concat(v ?? []);
  return type === 'tags' ? list.flatMap(splitTags) : list;
};

// Docker tag grammar: [A-Za-z0-9_][A-Za-z0-9_.-]{0,127}
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

// Split typed or pasted text on commas/whitespace into tags, merged into `existing` without duplicates.
// Entries that aren't valid docker tags come back in `invalid` instead of being added.
export function addTags(existing, text) {
  const tags = [...existing];
  const invalid = [];
  for (const raw of text.split(/[,\s]+/)) {
    if (!raw) continue;
    if (!TAG_RE.test(raw)) invalid.push(raw);
    else if (!tags.includes(raw)) tags.push(raw);
  }
  return { tags, invalid };
}

// Text still being typed in a tags field ({ [paramName]: text }) counts as entered: valid tags are
// merged into the values; `invalid` is set when any pending text isn't a valid tag (blocks submit).
export function withPendingTags(params = [], values = {}, pending = {}) {
  const merged = { ...values };
  let invalid = false;
  for (const p of params) {
    if (p.type !== 'tags' || !pending[p.name]?.trim()) continue;
    const r = addTags(toList('tags', values[p.name]), pending[p.name]);
    merged[p.name] = r.tags;
    if (r.invalid.length) invalid = true;
  }
  return { values: merged, invalid };
}

export function initFormState(params = [], saved = {}) {
  const state = {};
  for (const p of params) {
    if (isList(p.type)) state[p.name] = toList(p.type, p.default);
    else if (p.type === 'checkbox') state[p.name] = p.default || false;
    else state[p.name] = p.default || '';
    if (saved && Object.prototype.hasOwnProperty.call(saved, p.name)) state[p.name] = isList(p.type) ? toList(p.type, saved[p.name]) : saved[p.name];
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
    } else if (p.type === 'tags') {
      if (Array.isArray(val) && val.length) args.push(p.flag, val.join(','));
    } else if (val) {
      args.push(p.flag, val);
    }
  }
  return args;
}

export function isFormValid(params = [], values = {}, branch = '') {
  if (!branch) return false;
  return params.every((p) => {
    if (!p.required) return true;
    const val = values[p.name];
    if (p.type === 'checkbox') return val === true;
    return isList(p.type) ? Array.isArray(val) && val.length > 0 : !!val;
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
      if (i !== -1 && i + 1 < args.length) rows.push({ label, value: p.type === 'tags' ? splitTags(args[i + 1]).join(', ') : args[i + 1] });
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

// Form values from a finished run's args (inverse of buildArgs); unknown/malformed args fall back to defaults.
export function argsToValues(params = [], argsJson) {
  const args = parseJsonArray(argsJson);
  const values = initFormState(params);
  for (const p of params) {
    if (p.type === 'checkbox') {
      values[p.name] = args.includes(p.flag);
    } else if (p.type === 'multiselect') {
      values[p.name] = args.filter((a, i) => i > 0 && args[i - 1] === p.flag);
    } else {
      const i = args.indexOf(p.flag);
      if (i !== -1 && i + 1 < args.length) values[p.name] = p.type === 'tags' ? splitTags(args[i + 1]) : args[i + 1];
    }
  }
  return values;
}

// The image-tag param, if the project has one: a string or tags param named or labelled "tag".
// Words in a name or label: splits on non-letters and camelCase ("imageTag" → image, tag).
const words = (s) => (s || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);

export function tagParamOf(params = []) {
  // Whole word only: "stage" or "staging" must not count as the image tag.
  return params.find((p) => (p.type === 'string' || p.type === 'tags') && [...words(p.name), ...words(p.label)].includes('tag')) ?? null;
}

// A trailing "-<digits>" is a build counter when it has 2+ digits or follows a dotted version
// (dal-stg-1.0.0-2060, dal-stg-01). A single digit after a word (dal-stg-1) is part of the name.
function splitCounter(tag) {
  const m = /^(.*)-(\d+)$/.exec(tag);
  if (!m) return null;
  const [, base, digits] = m;
  if (digits.length >= 2 || base.split('-').pop().includes('.')) return { base, n: Number(digits), width: digits.length };
  return null;
}

// Next tag for "Rebuild with next tag": bump the counter past the highest known tag with the same base.
export function nextTag(tag, knownTags = []) {
  if (!tag) return '';
  const own = splitCounter(tag);
  const base = own ? own.base : tag;
  const width = own ? own.width : 2;
  let max = own ? own.n : 0;
  for (const k of knownTags) {
    const s = splitCounter(k);
    if (s && s.base === base) max = Math.max(max, s.n);
  }
  return `${base}-${String(max + 1).padStart(width, '0')}`;
}

// "Rebuild with next tag" for a tag param's value. A string tag always bumps. In a tag list only
// tags with a build counter bump (dal-stg-1.0.0-2060 → -2061); floating tags such as stage-latest
// are kept as-is. Returns null when nothing in the list can bump.
export function nextTagValue(value, knownTags = []) {
  if (!Array.isArray(value)) return value ? nextTag(value, knownTags) : null;
  if (!value.some((t) => splitCounter(t))) return null;
  // Each bumped tag joins the known set, so two counter tags with the same base never collide.
  const used = [...knownTags, ...value];
  return value.map((t) => {
    if (!splitCounter(t)) return t;
    const next = nextTag(t, used);
    used.push(next);
    return next;
  });
}
