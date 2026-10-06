import { describe, expect, it } from 'vitest'
import demoThree from '../../fixtures/demo-three-devices.json'
import demoTwo from '../../fixtures/demo-two-devices.json'
import { build1HzTimeline } from './bucket1Hz'
import { parseSession } from './parseSession'
import { findOutlier, scoreSourceOfTruth, scoreWizard } from './scoring'
import type { Session } from '../types'

function loadFixture(raw: unknown): Session {
  return parseSession(raw)
}

describe('scoreSourceOfTruth', () => {
  it('computes MAE / max / seconds compared against the reference', () => {
    const session = loadFixture(demoTwo)
    const timeline = build1HzTimeline(session)
    const result = scoreSourceOfTruth(session, timeline, 'AA:11:22:33:44:55')

    expect(result.modeLabel).toBe('vs Whoop 5')

    const polar = result.scores.find((s) => s.sourceId === 'BB:66:77:88:99:00')!
    const whoop = result.scores.find((s) => s.sourceId === 'AA:11:22:33:44:55')!

    // 2s lookback keeps Polar present at second 8 (last good poll 7.9).
    expect(polar.secondsCompared).toBe(10)
    // Errors: 2,2,1,2,1,5,1,1,1,2 → sum 18
    expect(polar.meanAbsoluteError).toBeCloseTo(18 / 10, 6)
    expect(polar.maxAbsoluteError).toBe(5)
    expect(polar.maxAbsoluteErrorAtSec).toBe(5)
    expect(polar.rank).toBe(1)

    expect(whoop.meanAbsoluteError).toBeNull()
    expect(whoop.secondsCompared).toBe(0)
    expect(result.bestSourceId).toBe('BB:66:77:88:99:00')
  })
})

describe('findOutlier / scoreWizard', () => {
  it('picks the largest deviation from the median; ties break by source id', () => {
    expect(
      findOutlier([
        { sourceId: 'B', bpm: 100 },
        { sourceId: 'A', bpm: 100 },
        { sourceId: 'C', bpm: 100 },
      ]),
    ).toBe('A')

    expect(
      findOutlier([
        { sourceId: 'A', bpm: 100 },
        { sourceId: 'B', bpm: 101 },
        { sourceId: 'C', bpm: 150 },
      ]),
    ).toBe('C')
  })

  it('drops the outlier, uses float mean of remaining, and scores all present devices', () => {
    const session = loadFixture(demoThree)
    const timeline = build1HzTimeline(session)
    const result = scoreWizard(session, timeline)

    expect(result.modeLabel).toBe('Wizard')
    expect(result.wizardReference).toBeDefined()

    // Second 0: 100,102,101 → outlier A (tie); mean=101.5
    // Second 1: 110,111,150 → outlier C; mean=110.5
    // Second 2: 120,118,119 → outlier A; mean=118.5
    // Second 3: A125,B126,C119 (carried) → outlier C; mean=125.5
    // Second 4: 130,129,131 → outlier B; mean=130.5
    // Second 5: 135,134,90 → outlier C; mean=134.5

    const refs = result.wizardReference!
    expect(refs[0]).toBeCloseTo(101.5, 6)
    expect(refs[1]).toBeCloseTo(110.5, 6)
    expect(refs[2]).toBeCloseTo(118.5, 6)
    expect(refs[3]).toBeCloseTo(125.5, 6)
    expect(refs[4]).toBeCloseTo(130.5, 6)
    expect(refs[5]).toBeCloseTo(134.5, 6)

    const garmin = result.scores.find((s) => s.sourceId === 'CC:12:34:56:78:90')!
    expect(garmin.secondsCompared).toBe(6)
    // Errors: 0.5 + 39.5 + 0.5 + 6.5 + 0.5 + 44.5 = 92
    expect(garmin.meanAbsoluteError).toBeCloseTo(92 / 6, 6)
    expect(garmin.maxAbsoluteError).toBeCloseTo(44.5, 6)
    expect(garmin.maxAbsoluteErrorAtSec).toBe(5)
    expect(garmin.rank).toBeGreaterThan(1)

    expect(result.worstSourceId).toBe('CC:12:34:56:78:90')
  })
})

describe('windowed scoring', () => {
  it('limits Source-of-truth stats to the visible second range', () => {
    const session = loadFixture(demoTwo)
    const timeline = build1HzTimeline(session)
    // Second 5 alone: Whoop 135, Polar 140 → error 5
    const result = scoreSourceOfTruth(
      session,
      timeline,
      'AA:11:22:33:44:55',
      { min: 5, max: 5 },
    )

    expect(result.isFullSession).toBe(false)
    expect(result.range).toEqual({ min: 5, max: 5 })

    const polar = result.scores.find((s) => s.sourceId === 'BB:66:77:88:99:00')!
    expect(polar.secondsCompared).toBe(1)
    expect(polar.meanAbsoluteError).toBe(5)
    expect(polar.maxAbsoluteError).toBe(5)
    expect(polar.maxAbsoluteErrorAtSec).toBe(5)
    expect(polar.sampleCount).toBe(1)
    expect(polar.coveragePercent).toBe(100)
  })

  it('limits Wizard stats to the window but keeps a full reference series', () => {
    const session = loadFixture(demoThree)
    const timeline = build1HzTimeline(session)
    const result = scoreWizard(session, timeline, { min: 1, max: 1 })

    expect(result.isFullSession).toBe(false)
    // Second 1: outlier Garmin 150, ref 110.5
    const garmin = result.scores.find((s) => s.sourceId === 'CC:12:34:56:78:90')!
    expect(garmin.secondsCompared).toBe(1)
    expect(garmin.meanAbsoluteError).toBeCloseTo(39.5, 6)

    // Full-session reference still populated outside the window for the chart.
    expect(result.wizardReference?.[0]).toBeCloseTo(101.5, 6)
    expect(result.wizardReference?.[1]).toBeCloseTo(110.5, 6)
    expect(result.wizardReference?.[3]).toBeCloseTo(125.5, 6)
  })
})
