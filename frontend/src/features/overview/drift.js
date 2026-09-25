// A present cell drifts when its tag differs from the nearest present cell to its
// left: envs are ordered by promotion (Settings order), so "left" = upstream.
export function computeDrift(row, envOrder) {
  const drift = {};
  envOrder.forEach((env, i) => {
    const cell = row.cells[env];
    if (cell?.kind !== 'present') return;
    for (let j = i - 1; j >= 0; j--) {
      const up = row.cells[envOrder[j]];
      if (up?.kind !== 'present') continue;
      if (up.tag !== cell.tag) drift[env] = { upstreamEnv: envOrder[j], upstreamTag: up.tag };
      return;
    }
  });
  return drift;
}
