import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useDrawer } from '@/features/container/useDrawer';

let api;
function Probe() {
  api = useDrawer();
  return <pre data-testid="state">{JSON.stringify({ open: api.open, tab: api.tab, prefillTag: api.prefillTag })}</pre>;
}
const setup = (path) => {
  const router = createMemoryRouter(
    [{ path: '/', element: <Probe /> }, { path: '/env/:env', element: <Probe /> }, { path: '/env/:env/:container', element: <Probe /> }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const state = () => JSON.parse(screen.getByTestId('state').textContent);

describe('useDrawer', () => {
  it('is closed by default and falls back to the deploy tab', () => {
    setup('/?tab=bogus');
    expect(state()).toEqual({ open: null, tab: 'deploy', prefillTag: null });
  });

  it('opens via ?open= on the overview, with prefill', () => {
    const router = setup('/');
    act(() => api.openDrawer('stage', 'frontend', 'deploy', { prefillTag: '1.2' }));
    expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=deploy&tag=1.2');
    expect(state()).toEqual({ open: { env: 'stage', container: 'frontend' }, tab: 'deploy', prefillTag: '1.2' });
    act(() => api.closeDrawer());
    expect(router.state.location.search).toBe('');
  });

  it('uses the path on environment pages', () => {
    const router = setup('/env/stage');
    act(() => api.openDrawer('stage', 'frontend', 'logs'));
    expect(router.state.location.pathname).toBe('/env/stage/frontend');
    expect(state()).toMatchObject({ open: { env: 'stage', container: 'frontend' }, tab: 'logs' });
    act(() => api.setTab('env'));
    expect(state().tab).toBe('env');
    act(() => api.closeDrawer());
    expect(router.state.location.pathname).toBe('/env/stage');
  });
});
