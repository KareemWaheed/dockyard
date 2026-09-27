import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { setViewport } from '@/test/viewport';

describe('useIsDesktop', () => {
  it('reflects the lg breakpoint', () => {
    setViewport({ desktop: true });
    expect(renderHook(() => useIsDesktop()).result.current).toBe(true);
    setViewport({ desktop: false });
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false);
  });
});
