import { describe, expect, it } from 'vitest'
import { build1HzTimeline } from './bucket1Hz'
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
  it('uses the most recent successful poll in the last 2 seconds per device', () => {
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
    // t=0 window [-1, 1): A→105, B→99
    // t=1 window [0, 2): A→110, B→99 (0.5 still within 2s)
    // t=2 window [1, 3): A→120, B→null (0.5 older than 2s)
    expect(timeline.series.get('A')).toEqual([105, 110, 120])
    expect(timeline.series.get('B')).toEqual([99, 99, null])
  })

  it('carries a poll forward for at most 2 seconds, then null', () => {
    const session: Session = {
      ...baseSession,
      samples: [
        { t: 0.2, sourceId: 'A', bpm: 100 },
        { t: 2.1, sourceId: 'A', bpm: 102 },
      ],
    }
    const timeline = build1HzTimeline(session)
    // t=0 [-1,1): 100; t=1 [0,2): 100; t=2 [1,3): 102
    expect(timeline.series.get('A')).toEqual([100, 100, 102])
  })

  it('ignores a device with no successful poll in the lookback window', () => {
    const session: Session = {
      ...baseSession,
      samples: [
        { t: 0.5, sourceId: 'A', bpm: 110 },
        { t: 3.2, sourceId: 'A', bpm: 115 },
      ],
    }
    const timeline = build1HzTimeline(session)
    expect(timeline.seconds).toEqual([0, 1, 2, 3])
    // Present at t=0,1 from 0.5; gap at t=2; fresh poll at t=3
    expect(timeline.series.get('A')).toEqual([110, 110, null, 115])
    expect(timeline.series.get('B')).toEqual([null, null, null, null])
  })
})
