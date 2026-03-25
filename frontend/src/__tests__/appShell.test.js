// frontend/src/__tests__/appShell.test.js
import { describe, it, expect } from 'vitest'
import { computeEnvStatuses } from '../AppShell'

describe('computeEnvStatuses', () => {
  it('returns loading when containers is null and no error', () => {
    expect(computeEnvStatuses({ dev: null }, { dev: false })).toEqual({ dev: 'loading' })
  })

  it('returns unknown when fetch errored', () => {
    expect(computeEnvStatuses({ dev: null }, { dev: true })).toEqual({ dev: 'unknown' })
  })

  it('returns healthy when all containers running', () => {
    const containers = [{ status: 'running' }, { status: 'running' }]
    expect(computeEnvStatuses({ dev: containers }, { dev: false })).toEqual({ dev: 'healthy' })
  })

  it('returns degraded when any container stopped', () => {
    const containers = [{ status: 'running' }, { status: 'stopped' }]
    expect(computeEnvStatuses({ dev: containers }, { dev: false })).toEqual({ dev: 'degraded' })
  })

  it('returns healthy when containers array is empty', () => {
    expect(computeEnvStatuses({ dev: [] }, { dev: false })).toEqual({ dev: 'healthy' })
  })

  it('handles multiple envs independently', () => {
    const result = computeEnvStatuses(
      { dev: [{ status: 'running' }], prod: null },
      { dev: false, prod: false }
    )
    expect(result).toEqual({ dev: 'healthy', prod: 'loading' })
  })
})
