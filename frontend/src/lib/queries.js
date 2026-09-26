import { keepPreviousData, useMutation, useMutationState, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { containerAction, fetchContainers, fetchSettingsServers } from '@/lib/api';

export const ENV_POLL_MS = 30000;
export const ACTION_KEY = 'container-action';

export const qk = {
  servers: ['servers'],
  containers: (env) => ['containers', env],
  history: (env, container, limit) => ['history', env ?? 'all', container ?? '', limit],
  suggestions: (env, service, image, current) => ['suggestions', env, service, image, current],
  buildProjects: ['build-projects'],
  buildRuns: (project) => ['build-runs', project],
  maintenance: (env) => ['maintenance', env],
};

export function useServers() {
  return useQuery({ queryKey: qk.servers, queryFn: fetchSettingsServers, staleTime: 60000 });
}

export function useEnvKeys() {
  const { data } = useServers();
  return (data || []).map((s) => s.env_key);
}

export function envQueryOptions(env) {
  return {
    queryKey: qk.containers(env),
    queryFn: () => fetchContainers(env),
    enabled: !!env,
    refetchInterval: ENV_POLL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
    placeholderData: keepPreviousData,
  };
}

export function useEnvContainers(env) {
  return useQuery(envQueryOptions(env));
}

// One entry per env, in settings order. `data` survives failed refetches (stale).
export function useAllEnvs() {
  const envs = useEnvKeys();
  const results = useQueries({ queries: envs.map(envQueryOptions) });
  return envs.map((env, i) => {
    const q = results[i];
    return {
      env,
      data: q.data,
      isLoading: q.isLoading,
      isError: q.isError,
      error: q.error,
      isFetching: q.isFetching,
      dataUpdatedAt: q.dataUpdatedAt,
    };
  });
}

// One hook instance can act on many containers of an env (the bulk bar does).
// variables: { container, action (logical name), endpoint, body }
export function useContainerAction(env) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [ACTION_KEY, env],
    mutationFn: ({ container, endpoint, body }) =>
      containerAction(env, container.name, endpoint, {
        stackPath: container.stackPath,
        serviceName: container.serviceName || container.name,
        stackName: container.stackName || '',
        ...body,
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.containers(env) });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

// Pending action for one container, from any useContainerAction instance of that env.
export function usePendingAction(env, containerName) {
  const pending = useMutationState({
    filters: {
      mutationKey: [ACTION_KEY, env],
      status: 'pending',
      predicate: (m) => m.state.variables?.container?.name === containerName,
    },
    select: (m) => ({ action: m.state.variables.action, body: m.state.variables.body }),
  });
  return pending[0] ?? null;
}
