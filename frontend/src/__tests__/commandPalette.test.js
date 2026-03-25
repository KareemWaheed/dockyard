// frontend/src/__tests__/commandPalette.test.js
import { describe, it, expect } from 'vitest'
import { filterContainers } from '../components/CommandPalette'

const makeContainer = (name, env, status = 'running') => ({ name, env, status, stack: 'main' })

describe('filterContainers', () => {
  const allContainers = [
    makeContainer('api-gateway', 'dev'),
    makeContainer('sensor-service', 'dev'),
    makeContainer('api-gateway', 'prod', 'stopped'),
  ]

  it('returns empty array for empty query', () => {
    expect(filterContainers(allContainers, '')).toEqual([])
  })

  it('matches by container name substring', () => {
    const result = filterContainers(allContainers, 'api')
    expect(result).toHaveLength(2)
    expect(result.every(r => r.name === 'api-gateway')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(filterContainers(allContainers, 'SENSOR')).toHaveLength(1)
  })

  it('returns empty when no match', () => {
    expect(filterContainers(allContainers, 'xyz')).toHaveLength(0)
  })
})
