import { flattenEnv } from '@/lib/containers';

export function envSummary({ data, isLoading, isError }) {
  if (isError) return { status: 'offline', tone: 'bad', label: 'offline' };
  if (!data) return { status: isLoading ? 'loading' : 'unknown', tone: 'idle', label: '' };
  const compose = flattenEnv(data).filter((c) => !c.standalone);
  const down = compose.filter((c) => c.status !== 'running').length;
  if (down > 0) return { status: 'degraded', tone: 'warn', label: `${down} down` };
  return { status: 'healthy', tone: 'ok', label: String(compose.length) };
}
