import { formatAgo } from '@/lib/containers';

// Docker tag grammar: [A-Za-z0-9_][A-Za-z0-9_.-]{0,127}
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
export function isValidTag(tag) {
  return typeof tag === 'string' && TAG_RE.test(tag);
}

// SQLite datetime('now') values have no zone and are UTC.
const toIso = (s) => (s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s);
const ago = (iso, now) => {
  const a = formatAgo(toIso(iso), now);
  return !a || a === 'just now' ? a : `${a} ago`;
};

export function buildSuggestionGroups({ env, current, otherEnvs, recentBuilds, previous, now = Date.now() }) {
  const seen = new Set([current]);
  const take = (items) => items.filter((i) => i.tag && !seen.has(i.tag) && seen.add(i.tag));
  const groups = [
    { heading: 'Other environments', items: take(otherEnvs.map((o) => ({ tag: o.tag, hint: `on ${o.env.toUpperCase()}`, source: 'env' }))) },
    {
      heading: 'Recent builds',
      items: take(
        recentBuilds.map((b) => ({
          tag: b.tag,
          hint: [`#${b.buildNumber}`, b.branch, b.finishedAt && formatAgo(toIso(b.finishedAt), now)].filter(Boolean).join(' · '),
          source: 'build',
        })),
      ),
    },
    { heading: `Previously on ${env.toUpperCase()}`, items: take(previous.map((p) => ({ tag: p.tag, hint: ago(p.at, now), source: 'previous' }))) },
  ];
  return groups.filter((g) => g.items.length > 0);
}
