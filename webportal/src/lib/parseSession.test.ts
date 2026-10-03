import { describe, expect, it } from 'vitest'
import { parseSession } from './parseSession'

describe('parseSession', () => {
  it('rejects invalid structure with a clear error', () => {
    expect(() => parseSession({})).toThrow(/sessionId/)
    expect(() =>
      parseSession({
        sessionId: 'x',
        startedAt: 'not-a-date',
        endedAt: '2026-01-01T00:00:01.000Z',
        sources: [{ id: 'A', name: 'A' }],
        samples: [],
      }),
    ).toThrow(/startedAt/)
  })

  it('accepts a minimal valid session', () => {
    const session = parseSession({
      sessionId: 'abc',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:10.000Z',
      sources: [{ id: 'A', name: 'Strap A' }],
      samples: [{ t: 1.2, sourceId: 'A', bpm: 140 }],
    })
    expect(session.sources[0].name).toBe('Strap A')
    expect(session.samples).toHaveLength(1)
  })
})
