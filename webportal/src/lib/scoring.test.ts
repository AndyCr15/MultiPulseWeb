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

    // Seconds with both present: 0..7 and 9 (second 8 has Polar bpm 0 → null)
    expect(polar.secondsCompared).toBe(9)
    // Errors: |122-120|=2, |123-121|=2, |124-125|=1, |128-130|=2,
    // |131-132|=1, |140-135|=5, |139-138|=1, |141-140|=1, |143-141|=2
    // sum = 17, mae = 17/9
    expect(polar.meanAbsoluteError).toBeCloseTo(17 / 9, 6)
    expect(polar.maxAbsoluteError).toBe(5)
    expect(polar.maxAbsoluteErrorAtSec).toBe(5)
    expect(polar.rank).toBe(1)
    expect(polar.sampleCount).toBe(9)
    expect(polar.totalPolls).toBe(9)
    expect(whoop.totalPolls).toBe(10)

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

  it('uses 2s lookback for Wizard reference but scores only true polls', () => {
    const session = loadFixture(demoThree)
    const timeline = build1HzTimeline(session)
    const result = scoreWizard(session, timeline)

    expect(result.modeLabel).toBe('Wizard')
    expect(result.wizardReference).toBeDefined()

    // Chart/timeline: second 3 has only A,B true polls; C missing on chart.
    expect(timeline.series.get('CC:12:34:56:78:90')?.[3]).toBeNull()

    // Wizard lookback still forms a reference at second 3 from C's 2.3 poll.
    const refs = result.wizardReference!
    expect(refs[0]).toBeCloseTo(101.5, 6)
    expect(refs[1]).toBeCloseTo(110.5, 6)
    expect(refs[2]).toBeCloseTo(118.5, 6)
    expect(refs[3]).toBeCloseTo(125.5, 6)
    expect(refs[4]).toBeCloseTo(130.5, 6)
    expect(refs[5]).toBeCloseTo(134.5, 6)

    const garmin = result.scores.find((s) => s.sourceId === 'CC:12:34:56:78:90')!
    // Garmin not scored at second 3 (no true poll) → 5 seconds compared.
    expect(garmin.secondsCompared).toBe(5)
    // Errors: 0.5 + 39.5 + 0.5 + 0.5 + 44.5 = 85.5
    expect(garmin.meanAbsoluteError).toBeCloseTo(85.5 / 5, 6)
    expect(garmin.maxAbsoluteError).toBeCloseTo(44.5, 6)
    expect(garmin.maxAbsoluteErrorAtSec).toBe(5)
    expect(garmin.sampleCount).toBe(5)
    expect(garmin.totalPolls).toBe(5)
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
    expect(polar.totalPolls).toBe(1)
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
    expect(garmin.totalPolls).toBe(1)

    // Full-session reference still populated outside the window for the chart.
    expect(result.wizardReference?.[0]).toBeCloseTo(101.5, 6)
    expect(result.wizardReference?.[1]).toBeCloseTo(110.5, 6)
    expect(result.wizardReference?.[3]).toBeCloseTo(125.5, 6)
  })
})
