export interface Source {
  id: string
  name: string
}

export interface Sample {
  t: number
  sourceId: string
  bpm: number
}

export interface EmbeddedReportRow {
  sourceId: string
  sourceName: string
  sampleCount: number
  samplesPerSecond: number
  coveragePercent: number
  agreementScoreBpm: number
  rank: number
}

export interface Session {
  sessionId: string
  startedAt: string
  endedAt: string
  sources: Source[]
  samples: Sample[]
  report?: EmbeddedReportRow[]
}

/** Row from GET /v1/sessions */
export interface SessionSummary {
  clientSessionId: string
  startedAt: string
  endedAt: string
  sourceCount: number
  sampleCount: number
  displayName: string
  createdAt: string
  updatedAt: string
}

/** Response from GET /v1/sessions/{id} */
export interface SessionDetail {
  clientSessionId: string
  displayName: string
  createdAt: string
  updatedAt: string
  payload: Session
}

/** Per-second BPM by sourceId; null when missing that second. */
export type Timeline = {
  /** Integer seconds from session start, inclusive range. */
  seconds: number[]
  /** sourceId -> bpm|null aligned to seconds */
  series: Map<string, (number | null)[]>
}

export type ScoringMode =
  | { type: 'sourceOfTruth'; referenceId: string }
  | { type: 'wizard' }

/** Inclusive integer-second window used for scoring (chart zoom). */
export interface TimeRange {
  min: number
  max: number
}

export interface DeviceScore {
  sourceId: string
  sourceName: string
  sampleCount: number
  coveragePercent: number
  meanAbsoluteError: number | null
  maxAbsoluteError: number | null
  secondsCompared: number
  rank: number | null
}

export interface ScoringResult {
  modeLabel: string
  scores: DeviceScore[]
  /** Wizard reference series aligned to timeline seconds (null when N/A). */
  wizardReference?: (number | null)[]
  bestSourceId: string | null
  worstSourceId: string | null
  /** Window the scores were computed over (integer seconds, inclusive). */
  range: TimeRange
  /** True when range is the full timeline. */
  isFullSession: boolean
}
