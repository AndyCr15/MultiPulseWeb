import type { Sample, Session, Timeline } from '../types'

/**
 * Align samples onto a 1 Hz timeline.
 * For each integer second t, use the last sample with tSeconds in [t, t+1)
 * and bpm > 0. Missing buckets are null.
 */
export function build1HzTimeline(session: Session): Timeline {
  const positive = session.samples.filter((s) => s.bpm > 0)

  let minT = 0
  let maxT = 0

  if (positive.length > 0) {
    minT = Math.min(...positive.map((s) => s.t))
    maxT = Math.max(...positive.map((s) => s.t))
  } else {
    const durationSec = Math.max(
      0,
      (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000,
    )
    maxT = durationSec
  }

  const startSec = Math.max(0, Math.floor(minT))
  const endSec = Math.max(startSec, Math.floor(maxT))
  const seconds: number[] = []
  for (let t = startSec; t <= endSec; t++) {
    seconds.push(t)
  }

  const bySource = new Map<string, Sample[]>()
  for (const source of session.sources) {
    bySource.set(source.id, [])
  }
  for (const sample of positive) {
    const list = bySource.get(sample.sourceId)
    if (list) list.push(sample)
  }

  const series = new Map<string, (number | null)[]>()

  for (const source of session.sources) {
    const samples = bySource.get(source.id) ?? []
    samples.sort((a, b) => a.t - b.t || a.bpm - b.bpm)

    // Bucket: last sample in [t, t+1)
    const buckets = new Map<number, number>()
    for (const sample of samples) {
      const bucket = Math.floor(sample.t)
      if (bucket < startSec || bucket > endSec) continue
      buckets.set(bucket, sample.bpm)
    }

    const values: (number | null)[] = seconds.map((t) =>
      buckets.has(t) ? (buckets.get(t) as number) : null,
    )
    series.set(source.id, values)
  }

  return { seconds, series }
}

/** Count of non-null BPM values for a source on the timeline. */
export function countPresent(values: (number | null)[]): number {
  let n = 0
  for (const v of values) {
    if (v !== null) n++
  }
  return n
}

/** Coverage as percent of timeline seconds with a reading. */
export function coveragePercent(
  values: (number | null)[],
  totalSeconds: number,
): number {
  if (totalSeconds <= 0) return 0
  return (countPresent(values) / totalSeconds) * 100
}
