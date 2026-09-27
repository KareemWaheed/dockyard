import { useCallback } from 'react';
import { useLocation, useMatch, useNavigate, useSearchParams } from 'react-router';

const TABS = ['deploy', 'logs', 'env', 'info', 'history'];

// Drawer state lives in the URL:
//   /env/:env/:container?tab=…            on environment pages
//   <any path>?open=:env/:container&tab=… everywhere else (Overview, legacy pages)
export function useDrawer() {
  const match = useMatch('/env/:env/:container');
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  let open = null;
  if (match) {
    open = { env: match.params.env, container: match.params.container };
  } else {
    const raw = search.get('open');
    const slash = raw ? raw.indexOf('/') : -1;
    if (slash > 0) open = { env: raw.slice(0, slash), container: raw.slice(slash + 1) };
  }
  const tabParam = search.get('tab');
  const tab = TABS.includes(tabParam) ? tabParam : 'deploy';
  const prefillTag = search.get('tag');
  const onEnvPage = location.pathname.startsWith('/env/');

  const openDrawer = useCallback(
    (env, containerName, nextTab = 'deploy', { prefillTag: tag } = {}) => {
      if (onEnvPage) {
        const params = new URLSearchParams({ tab: nextTab });
        if (tag) params.set('tag', tag);
        navigate(`/env/${encodeURIComponent(env)}/${encodeURIComponent(containerName)}?${params}`);
        return;
      }
      const next = new URLSearchParams(location.search);
      next.set('open', `${env}/${containerName}`);
      next.set('tab', nextTab);
      if (tag) next.set('tag', tag);
      else next.delete('tag');
      navigate({ pathname: location.pathname, search: `?${next}` });
    },
    [navigate, location.pathname, location.search, onEnvPage],
  );

  const setTab = useCallback(
    (nextTab) => {
      const next = new URLSearchParams(location.search);
      next.set('tab', nextTab);
      next.delete('tag');
      navigate({ pathname: location.pathname, search: `?${next}` }, { replace: true });
    },
    [navigate, location.pathname, location.search],
  );

  const closeDrawer = useCallback(() => {
    if (match) {
      navigate(`/env/${encodeURIComponent(match.params.env)}`);
      return;
    }
    const next = new URLSearchParams(location.search);
    ['open', 'tab', 'tag'].forEach((k) => next.delete(k));
    const qs = next.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' });
  }, [navigate, match, location.pathname, location.search]);

  return { open, tab, prefillTag, openDrawer, setTab, closeDrawer };
}
