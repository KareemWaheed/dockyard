import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchBuildRuns, fetchProjects } from '@/lib/api';
import { qk } from '@/lib/queries';

// Running + queued builds across projects. Always polled (the sidebar badge needs it);
// faster while the activity panel is open.
export function useBuildActivity({ fast = false } = {}) {
  const projects = useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });
  const keys = Object.keys(projects.data || {});
  const runs = useQueries({
    queries: keys.map((project) => ({
      queryKey: qk.buildRuns(project),
      queryFn: () => fetchBuildRuns(project, { limit: 5 }),
      refetchInterval: fast ? 10000 : 30000,
    })),
  });
  const active = runs.flatMap((q, i) =>
    (q.data?.runs || []).filter((r) => r.status === 'running' || r.status === 'queued').map((r) => ({ ...r, project: keys[i] })),
  );
  return { active, count: active.length };
}
