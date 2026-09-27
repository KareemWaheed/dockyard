import { readPref, writePref } from '@/lib/storage';

const KEY = 'builds.recent';
// Written by the pre-rebuild Builds page as { [project]: { branch, ...formValues } }.
const LEGACY_KEY = 'dockyard_build_recent';

export function loadRecent(project) {
  const all = readPref(KEY, null);
  if (all && all[project]) return all[project];
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    const entry = legacy?.[project];
    if (!entry) return null;
    const { branch = '', ...values } = entry;
    return { branch, values };
  } catch {
    return null;
  }
}

export function saveRecent(project, { branch, values }) {
  const all = readPref(KEY, {}) || {};
  writePref(KEY, { ...all, [project]: { branch, values } });
}
