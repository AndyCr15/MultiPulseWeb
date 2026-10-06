import { countPresent, countTotalPolls, coveragePercent } from './bucket1Hz'
import type {
  DeviceScore,
  ScoringMode,
  ScoringResult,
  Session,
  TimeRange,
  Timeline,
} from '../types'

/** Wizard may use a device's most recent successful poll within this many seconds. */
export const WIZARD_LOOKBACK_SEC = 2

interface Accumulator {
  sumAbs: number
  maxAbs: number
  maxAbsAtSec: number | null
  compared: number
}

function emptyAcc(): Accumulator {
  return { sumAbs: 0, maxAbs: 0, maxAbsAtSec: null, compared: 0 }
}

function noteError(acc: Accumulator, err: number, atSec: number): void {
  acc.sumAbs += err
  if (acc.compared === 0 || err > acc.maxAbs) {
    acc.maxAbs = err
    acc.maxAbsAtSec = atSec
  }
  acc.compared += 1
}

function median(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return NaN
  const mid = Math.floor(n / 2)
  if (n % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Find the single outlier: largest absolute deviation from the median.
 * Tie-break by source id ascending (lexicographic).
 */
export function findOutlier(
  readings: { sourceId: string; bpm: number }[],
): string {
  const values = readings.map((r) => r.bpm).sort((a, b) => a - b)
  const med = median(values)

  let bestId = readings[0].sourceId
  let bestDev = -1

  // Stable scan: prefer larger deviation; on tie, smaller sourceId.
  const ordered = [...readings].sort((a, b) =>
    a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0,
  )

  for (const r of ordered) {
    const dev = Math.abs(r.bpm - med)
    if (dev > bestDev || (dev === bestDev && r.sourceId < bestId)) {
      bestDev = dev
      bestId = r.sourceId
    }
  }
  return bestId
}

/** Normalize a chart scale range to inclusive integer seconds. */
export function normalizeTimeRange(range: TimeRange): TimeRange {
  const min = Math.floor(Math.min(range.min, range.max))
  const max = Math.floor(Math.max(range.min, range.max))
  return { min, max }
}

export function fullTimelineRange(timeline: Timeline): TimeRange | null {
  if (timeline.seconds.length === 0) return null
  return {
    min: timeline.seconds[0],
    max: timeline.seconds[timeline.seconds.length - 1],
  }
}

/** Indices of timeline seconds inside an inclusive integer range. */
export function indicesInRange(
  timeline: Timeline,
  range: TimeRange,
): number[] {
  const { min, max } = normalizeTimeRange(range)
  const idxs: number[] = []
  for (let i = 0; i < timeline.seconds.length; i++) {
    const t = timeline.seconds[i]
    if (t >= min && t <= max) idxs.push(i)
  }
  return idxs
}

function sortedPositiveBySource(
  session: Session,
): Map<string, { t: number; bpm: number }[]> {
  const map = new Map<string, { t: number; bpm: number }[]>()
  for (const source of session.sources) {
    map.set(source.id, [])
  }
  for (const sample of session.samples) {
    if (sample.bpm <= 0) continue
    const list = map.get(sample.sourceId)
    if (!list) continue
    list.push({ t: sample.t, bpm: sample.bpm })
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.t - b.t || a.bpm - b.bpm)
  }
  return map
}

/**
 * Most recent successful poll in [windowStart, windowEnd).
 * `right` is an exclusive index cursor advanced across increasing windows.
 */
function latestInWindow(
  samples: { t: number; bpm: number }[],
  windowStart: number,
  windowEnd: number,
  right: { value: number },
): number | null {
  while (right.value < samples.length && samples[right.value].t < windowEnd) {
    right.value += 1
  }
  const last = right.value > 0 ? samples[right.value - 1] : null
  if (last && last.t >= windowStart) return last.bpm
  return null
}

function finalizeScores(
  session: Session,
  timeline: Timeline,
  indices: number[],
  range: TimeRange,
  accBySource: Map<string, Accumulator>,
  modeLabel: string,
  wizardReference?: (number | null)[],
): ScoringResult {
  const totalSeconds = indices.length
  const full = fullTimelineRange(timeline)
  const isFullSession =
    full !== null && range.min === full.min && range.max === full.max

  const scores: DeviceScore[] = session.sources.map((source) => {
    const values = timeline.series.get(source.id) ?? []
    const windowValues = indices.map((i) => values[i] ?? null)
    const acc = accBySource.get(source.id) ?? emptyAcc()
    const sampleCount = countPresent(windowValues)
    return {
      sourceId: source.id,
      sourceName: source.name,
      sampleCount,
      totalPolls: countTotalPolls(session, source.id, range),
      coveragePercent: coveragePercent(windowValues, totalSeconds),
      meanAbsoluteError:
        acc.compared > 0 ? acc.sumAbs / acc.compared : null,
      maxAbsoluteError: acc.compared > 0 ? acc.maxAbs : null,
      maxAbsoluteErrorAtSec: acc.compared > 0 ? acc.maxAbsAtSec : null,
      secondsCompared: acc.compared,
      rank: null,
    }
  })

  // Rank candidates with a score by ascending MAE; ties keep source id order.
  const ranked = scores
    .filter((s) => s.meanAbsoluteError !== null)
    .sort((a, b) => {
      const mae = (a.meanAbsoluteError as number) - (b.meanAbsoluteError as number)
      if (mae !== 0) return mae
      return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0
    })

  ranked.forEach((s, i) => {
    s.rank = i + 1
  })

  const best = ranked[0] ?? null
  const worst = ranked.length > 0 ? ranked[ranked.length - 1] : null

  const byId = new Map(scores.map((s) => [s.sourceId, s]))
  const ordered = session.sources.map((src) => byId.get(src.id)!)

  return {
    modeLabel,
    scores: ordered,
    wizardReference,
    bestSourceId: best?.sourceId ?? null,
    worstSourceId: worst?.sourceId ?? null,
    range,
    isFullSession,
  }
}

/** Source-of-truth scoring: MAE vs a chosen reference monitor. */
export function scoreSourceOfTruth(
  session: Session,
  timeline: Timeline,
  referenceId: string,
  range?: TimeRange | null,
): ScoringResult {
  const refName =
    session.sources.find((s) => s.id === referenceId)?.name ?? referenceId
  const refSeries = timeline.series.get(referenceId)
  if (!refSeries) {
    throw new Error(`Unknown reference source: ${referenceId}`)
  }

  const effective =
    range != null ? normalizeTimeRange(range) : fullTimelineRange(timeline)
  if (!effective) {
    return finalizeScores(
      session,
      timeline,
      [],
      { min: 0, max: 0 },
      new Map(),
      `vs ${refName}`,
    )
  }

  const indices = indicesInRange(timeline, effective)
  const accBySource = new Map<string, Accumulator>()
  for (const source of session.sources) {
    accBySource.set(source.id, emptyAcc())
  }

  for (const i of indices) {
    const refBpm = refSeries[i]
    if (refBpm === null) continue

    for (const source of session.sources) {
      if (source.id === referenceId) continue
      const bpm = timeline.series.get(source.id)?.[i] ?? null
      if (bpm === null) continue
      const err = Math.abs(bpm - refBpm)
      noteError(accBySource.get(source.id)!, err, timeline.seconds[i])
    }
  }

  return finalizeScores(
    session,
    timeline,
    indices,
    effective,
    accBySource,
    `vs ${refName}`,
  )
}

/**
 * Wizard scoring: for each second, resolve each device via a 2s lookback for
 * consensus (≥3 lookback readings → drop outlier → mean reference). Chart
 * timeline stays true polls only. Errors are recorded only for devices with a
 * true poll in that second.
 */
export function scoreWizard(
  session: Session,
  timeline: Timeline,
  range?: TimeRange | null,
): ScoringResult {
  const effective =
    range != null ? normalizeTimeRange(range) : fullTimelineRange(timeline)
  if (!effective) {
    return finalizeScores(
      session,
      timeline,
      [],
      { min: 0, max: 0 },
      new Map(),
      'Wizard',
      [],
    )
  }

  const indices = indicesInRange(timeline, effective)
  const scoreIndexSet = new Set(indices)
  const accBySource = new Map<string, Accumulator>()
  for (const source of session.sources) {
    accBySource.set(source.id, emptyAcc())
  }

  const bySource = sortedPositiveBySource(session)
  const cursors = new Map<string, { value: number }>()
  for (const source of session.sources) {
    cursors.set(source.id, { value: 0 })
  }

  // Reference series is always full-session (stable chart line while zooming).
  // Error accumulation only runs for seconds inside the scored window.
  const wizardReference: (number | null)[] = timeline.seconds.map(() => null)

  for (let i = 0; i < timeline.seconds.length; i++) {
    const t = timeline.seconds[i]
    const windowEnd = t + 1
    const windowStart = windowEnd - WIZARD_LOOKBACK_SEC

    const lookbackReadings: { sourceId: string; bpm: number }[] = []
    for (const source of session.sources) {
      const bpm = latestInWindow(
        bySource.get(source.id) ?? [],
        windowStart,
        windowEnd,
        cursors.get(source.id)!,
      )
      if (bpm !== null) {
        lookbackReadings.push({ sourceId: source.id, bpm })
      }
    }
    if (lookbackReadings.length < 3) continue

    const outlierId = findOutlier(lookbackReadings)
    const kept = lookbackReadings.filter((r) => r.sourceId !== outlierId)
    const reference =
      kept.reduce((sum, r) => sum + r.bpm, 0) / kept.length
    wizardReference[i] = reference

    if (!scoreIndexSet.has(i)) continue

    // Score only devices with a true poll in this second (timeline bucket).
    for (const source of session.sources) {
      const trueBpm = timeline.series.get(source.id)?.[i] ?? null
      if (trueBpm === null) continue
      noteError(
        accBySource.get(source.id)!,
        Math.abs(trueBpm - reference),
        t,
      )
    }
  }

  return finalizeScores(
    session,
    timeline,
    indices,
    effective,
    accBySource,
    'Wizard',
    wizardReference,
  )
}

export function scoreSession(
  session: Session,
  timeline: Timeline,
  mode: ScoringMode,
  range?: TimeRange | null,
): ScoringResult {
  if (mode.type === 'wizard') {
    return scoreWizard(session, timeline, range)
  }
  return scoreSourceOfTruth(session, timeline, mode.referenceId, range)
}

export function canUseSourceOfTruth(deviceCount: number): boolean {
  return deviceCount >= 2
}

export function canUseWizard(deviceCount: number): boolean {
  return deviceCount >= 3
}
