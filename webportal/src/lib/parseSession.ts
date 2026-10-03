import type { Sample, Session, Source } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSource(raw: unknown, index: number): Source {
  if (!isRecord(raw)) {
    throw new Error(`sources[${index}] must be an object`)
  }
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error(`sources[${index}].id must be a non-empty string`)
  }
  if (typeof raw.name !== 'string') {
    throw new Error(`sources[${index}].name must be a string`)
  }
  return { id: raw.id, name: raw.name }
}

function parseSample(raw: unknown, index: number): Sample {
  if (!isRecord(raw)) {
    throw new Error(`samples[${index}] must be an object`)
  }
  if (typeof raw.t !== 'number' || !Number.isFinite(raw.t)) {
    throw new Error(`samples[${index}].t must be a finite number`)
  }
  if (typeof raw.sourceId !== 'string' || raw.sourceId.length === 0) {
    throw new Error(`samples[${index}].sourceId must be a non-empty string`)
  }
  if (typeof raw.bpm !== 'number' || !Number.isFinite(raw.bpm)) {
    throw new Error(`samples[${index}].bpm must be a finite number`)
  }
  return { t: raw.t, sourceId: raw.sourceId, bpm: raw.bpm }
}

/** Validate and normalize a MultiPulse session export. */
export function parseSession(data: unknown): Session {
  if (!isRecord(data)) {
    throw new Error('Session JSON must be an object')
  }

  if (typeof data.sessionId !== 'string' || data.sessionId.length === 0) {
    throw new Error('sessionId must be a non-empty string')
  }
  if (typeof data.startedAt !== 'string' || data.startedAt.length === 0) {
    throw new Error('startedAt must be a non-empty ISO-8601 string')
  }
  if (typeof data.endedAt !== 'string' || data.endedAt.length === 0) {
    throw new Error('endedAt must be a non-empty ISO-8601 string')
  }
  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    throw new Error('sources must be a non-empty array')
  }
  if (!Array.isArray(data.samples)) {
    throw new Error('samples must be an array')
  }

  const started = Date.parse(data.startedAt)
  const ended = Date.parse(data.endedAt)
  if (Number.isNaN(started)) {
    throw new Error('startedAt is not a valid date')
  }
  if (Number.isNaN(ended)) {
    throw new Error('endedAt is not a valid date')
  }
  if (ended < started) {
    throw new Error('endedAt must be on or after startedAt')
  }

  const sources = data.sources.map(parseSource)
  const sourceIds = new Set(sources.map((s) => s.id))
  if (sourceIds.size !== sources.length) {
    throw new Error('sources contain duplicate ids')
  }

  const samples = data.samples.map(parseSample)
  for (let i = 0; i < samples.length; i++) {
    if (!sourceIds.has(samples[i].sourceId)) {
      throw new Error(
        `samples[${i}].sourceId "${samples[i].sourceId}" is not in sources`,
      )
    }
  }

  return {
    sessionId: data.sessionId,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
    sources,
    samples,
    report: Array.isArray(data.report)
      ? (data.report as Session['report'])
      : undefined,
  }
}

export async function parseSessionFile(file: File): Promise<Session> {
  const name = file.name.toLowerCase()
  const looksLikeExport =
    name.endsWith('.json') &&
    (name.startsWith('multipulse-') ||
      name.startsWith('hr-comparison-') ||
      name.includes('multipulse') ||
      name.includes('hr-comparison'))

  let text: string
  try {
    text = await file.text()
  } catch {
    throw new Error('Could not read the selected file')
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON')
  }

  const session = parseSession(json)

  if (!looksLikeExport) {
    // Soft warning path: still accept if schema is valid.
  }

  return session
}
