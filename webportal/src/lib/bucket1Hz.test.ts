import { describe, expect, it } from 'vitest'
import { build1HzTimeline, countTotalPolls } from './bucket1Hz'
import type { Session } from '../types'

const baseSession: Session = {
  sessionId: 't',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:00:05.000Z',
  sources: [
    { id: 'A', name: 'A' },
    { id: 'B', name: 'B' },
  ],
  samples: [],
}

describe('build1HzTimeline', () => {
  it('uses the last sample in each [t, t+1) bucket and ignores bpm <= 0', () => {
    const session: Session = {
      ...baseSession,
      samples: [
        { t: 0.1, sourceId: 'A', bpm: 100 },
        { t: 0.9, sourceId: 'A', bpm: 105 },
        { t: 1.0, sourceId: 'A', bpm: 110 },
        { t: 1.5, sourceId: 'A', bpm: 0 },
        { t: 2.2, sourceId: 'A', bpm: 120 },
        { t: 0.5, sourceId: 'B', bpm: 99 },
      ],
    }

    const timeline = build1HzTimeline(session)
    expect(timeline.seconds).toEqual([0, 1, 2])
    expect(timeline.series.get('A')).toEqual([105, 110, 120])
    expect(timeline.series.get('B')).toEqual([99, null, null])
  })

  it('fills null when a second has no positive samples', () => {
    const session: Session = {
      ...baseSession,
      samples: [
        { t: 0.2, sourceId: 'A', bpm: 100 },
        { t: 2.1, sourceId: 'A', bpm: 102 },
      ],
    }
    const timeline = build1HzTimeline(session)
    expect(timeline.series.get('A')).toEqual([100, null, 102])
  })
})

describe('countTotalPolls', () => {
  it('counts every successful raw poll in the window, not 1 Hz buckets', () => {
    const session: Session = {
      ...baseSession,
      samples: [
        { t: 0.1, sourceId: 'A', bpm: 100 },
        { t: 0.3, sourceId: 'A', bpm: 101 },
        { t: 0.9, sourceId: 'A', bpm: 102 },
        { t: 1.1, sourceId: 'A', bpm: 103 },
        { t: 1.2, sourceId: 'A', bpm: 0 },
        { t: 0.5, sourceId: 'B', bpm: 99 },
      ],
    }
    expect(countTotalPolls(session, 'A', { min: 0, max: 0 })).toBe(3)
    expect(countTotalPolls(session, 'A', { min: 0, max: 1 })).toBe(4)
    expect(countTotalPolls(session, 'B', { min: 0, max: 1 })).toBe(1)
  })
})
