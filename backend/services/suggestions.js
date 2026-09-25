// Deploy suggestions for the tag combobox. splitImage must match
// frontend/src/lib/image.js exactly: both sides use the same fixture table.

function splitImage(image = '') {
  const at = image.indexOf('@');
  if (at !== -1) return { repo: image.slice(0, at), tag: image.slice(at + 1) };
  const slash = image.lastIndexOf('/');
  const colon = image.lastIndexOf(':');
  if (colon > slash) return { repo: image.slice(0, colon), tag: image.slice(colon + 1) };
  return { repo: image, tag: 'latest' };
}

function parseJsonArray(text) {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// runs: build_runs rows, newest first. Returns builds that pushed an image of `repo`.
function recentBuildsForRepo(runs, repo, current, limit = 10) {
  const out = [];
  const seen = new Set();
  for (const run of runs) {
    for (const ref of parseJsonArray(run.pushed_images_json)) {
      const { repo: r, tag } = splitImage(ref);
      if (r !== repo || tag === current || seen.has(tag)) continue;
      seen.add(tag);
      out.push({ tag, project: run.project, buildNumber: run.build_number, branch: run.branch, finishedAt: run.finished_at });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// rows: deploy_history rows (new_tag, old_tag, timestamp), newest first.
function previousTags(rows, current, limit = 10) {
  const out = [];
  const seen = new Set([current]);
  for (const row of rows) {
    for (const tag of [row.new_tag, row.old_tag]) {
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push({ tag, at: row.timestamp });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

module.exports = { splitImage, recentBuildsForRepo, previousTags };
