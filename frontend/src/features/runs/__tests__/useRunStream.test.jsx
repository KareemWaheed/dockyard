import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRunStream } from '@/features/runs/useRunStream';

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.closed = true; }
  emit(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

let qc;
const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  qc = new QueryClient();
});
afterEach(() => vi.unstubAllGlobals());

describe('useRunStream', () => {
  it('streams chunks, meta and stuck alerts, then finishes', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useRunStream('build', 7, { project: 'api', active: true }), { wrapper });
    const ws = FakeSocket.instances[0];
    expect(ws.url).toMatch(/\/ws\/builds\?runId=7$/);
    act(() => { ws.onopen(); ws.emit({ type: 'chunk', text: 'step 1\nstep ' }); });
    expect(result.current.status).toBe('open');
    act(() => ws.emit({ type: 'stuck_alert' }));
    expect(result.current.stuck).toBe(true);
    act(() => ws.emit({ type: 'chunk', text: '2\n' }));
    expect(result.current.stuck).toBe(false);
    expect(result.current.lines).toEqual(['step 1', 'step 2']);
    act(() => ws.emit({ type: 'meta', commits_json: '[{"hash":"a"}]', branch: 'main' }));
    expect(result.current.meta).toEqual({ commits_json: '[{"hash":"a"}]', branch: 'main' });
    act(() => { ws.emit({ type: 'done', status: 'success', pushed_images_json: '["reg/a:1"]' }); ws.onclose(); });
    expect(result.current.status).toBe('done');
    expect(result.current.finalStatus).toBe('success');
    expect(result.current.meta.pushed_images_json).toBe('["reg/a:1"]');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['build-runs', 'api'] });
  });

  it('does not invalidate lists when replaying an already finished run', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useRunStream('flyway', 3, { active: false }), { wrapper });
    const ws = FakeSocket.instances[0];
    expect(ws.url).toMatch(/\/ws\/flyway\?runId=3$/);
    act(() => { ws.emit({ type: 'chunk', text: 'old log\n' }); ws.emit({ type: 'done', status: 'failed' }); });
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes the previous socket when the run changes (Review Focus 3)', () => {
    const { rerender, result } = renderHook(({ id }) => useRunStream('build', id, { project: 'api' }), { wrapper, initialProps: { id: 1 } });
    const first = FakeSocket.instances[0];
    act(() => first.emit({ type: 'chunk', text: 'from run 1\n' }));
    rerender({ id: 2 });
    expect(first.closed).toBe(true);
    expect(FakeSocket.instances[1].url).toMatch(/runId=2$/);
    act(() => first.emit({ type: 'chunk', text: 'late chunk\n' }));
    expect(result.current.lines).toEqual([]);
  });

  it('reports an unexpected close and reconnects when the page becomes visible', () => {
    const { result } = renderHook(() => useRunStream('build', 9, { project: 'api', active: true }), { wrapper });
    act(() => FakeSocket.instances[0].onclose());
    expect(result.current.status).toBe('closed');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('shows backend errors in the log and opens nothing without a run id', () => {
    const { result, rerender } = renderHook(({ id }) => useRunStream('build', id), { wrapper, initialProps: { id: null } });
    expect(FakeSocket.instances).toHaveLength(0);
    rerender({ id: 4 });
    act(() => FakeSocket.instances[0].emit({ type: 'error', message: 'Run not found' }));
    expect(result.current.lines).toContain('ERROR: Run not found');
  });
});
