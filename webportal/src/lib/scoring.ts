import { countPresent, coveragePercent } from './bucket1Hz'
import type {
  DeviceScore,
  ScoringMode,
  ScoringResult,
  Session,
  TimeRange,
  Timeline,
} from '../types'

interface Accumulator {
  sumAbs: number
  maxAbs: number
  compared: number
}

function emptyAcc(): Accumulator {
  return { sumAbs: 0, maxAbs: 0, compared: 0 }
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
      coveragePercent: coveragePercent(windowValues, totalSeconds),
      meanAbsoluteError:
        acc.compared > 0 ? acc.sumAbs / acc.compared : null,
      maxAbsoluteError: acc.compared > 0 ? acc.maxAbs : null,
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
      const acc = accBySource.get(source.id)!
      acc.sumAbs += err
      acc.maxAbs = Math.max(acc.maxAbs, err)
      acc.compared += 1
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
 * Wizard scoring: each second with ≥3 devices present, drop the single
 * outlier (largest |bpm − median|; tie-break source id ascending), then
 * reference = mean of the remaining devices (kept as float). Every device
 * present that second (including the outlier) scores |bpm − reference|.
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

  // Reference series is always full-session (stable chart line while zooming).
  // Error accumulation only runs for seconds inside the scored window.
  const wizardReference: (number | null)[] = timeline.seconds.map(() => null)

  for (let i = 0; i < timeline.seconds.length; i++) {
    const readings: { sourceId: string; bpm: number }[] = []
    for (const source of session.sources) {
      const bpm = timeline.series.get(source.id)?.[i] ?? null
      if (bpm !== null) readings.push({ sourceId: source.id, bpm })
    }
    if (readings.length < 3) continue

    const outlierId = findOutlier(readings)
    const kept = readings.filter((r) => r.sourceId !== outlierId)
    const reference =
      kept.reduce((sum, r) => sum + r.bpm, 0) / kept.length
    wizardReference[i] = reference

    if (!scoreIndexSet.has(i)) continue

    for (const r of readings) {
      const err = Math.abs(r.bpm - reference)
      const acc = accBySource.get(r.sourceId)!
      acc.sumAbs += err
      acc.maxAbs = Math.max(acc.maxAbs, err)
      acc.compared += 1
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
