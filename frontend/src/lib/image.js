// Must match backend/services/suggestions.js splitImage (same fixture table in both test suites).
export function splitImage(image = '') {
  const ref = image ?? '';
  const at = ref.indexOf('@');
  if (at !== -1) return { repo: ref.slice(0, at), tag: ref.slice(at + 1) };
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  if (colon > slash) return { repo: ref.slice(0, colon), tag: ref.slice(colon + 1) };
  return { repo: ref, tag: 'latest' };
}

export function imageTag(image) {
  return splitImage(image).tag;
}
