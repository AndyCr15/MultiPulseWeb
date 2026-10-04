import type { ApiSettings } from './apiSettings'
import { loadApiSettings } from './apiSettings'
import type { Session, SessionDetail, SessionSummary } from '../types'

export class ApiError extends Error {
  status: number | null
  code: 'unauthorized' | 'not_found' | 'network' | 'http' | 'invalid'

  constructor(
    message: string,
    opts: {
      status?: number | null
      code: ApiError['code']
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = opts.status ?? null
    this.code = opts.code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  settings: ApiSettings = loadApiSettings(),
): Promise<Response> {
  if (!settings.token) {
    throw new ApiError(
      'API token missing. Open Settings and paste your Bearer token.',
      { code: 'unauthorized', status: 401 },
    )
  }

  const url = `${settings.baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.token}`,
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(
      'Network error — could not reach the MultiPulse API. Check the base URL and your connection.',
      { code: 'network' },
    )
  }

  if (response.status === 401) {
    throw new ApiError(
      'Unauthorized (401) — token missing, invalid, or expired. Update it in Settings.',
      { code: 'unauthorized', status: 401 },
    )
  }
  if (response.status === 404) {
    throw new ApiError('Session not found (404). It may have been deleted.', {
      code: 'not_found',
      status: 404,
    })
  }
  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      detail = body.error || body.message || ''
    } catch {
      // ignore
    }
    throw new ApiError(
      detail
        ? `API error ${response.status}: ${detail}`
        : `API error ${response.status}`,
      { code: 'http', status: response.status },
    )
  }

  return response
}

function parseSessionSummary(raw: unknown): SessionSummary {
  if (!isRecord(raw)) {
    throw new ApiError('Invalid session list entry from API', { code: 'invalid' })
  }
  if (typeof raw.clientSessionId !== 'string' || !raw.clientSessionId) {
    throw new ApiError('Session missing clientSessionId', { code: 'invalid' })
  }
  return {
    clientSessionId: raw.clientSessionId,
    startedAt: String(raw.startedAt ?? ''),
    endedAt: String(raw.endedAt ?? ''),
    sourceCount: Number(raw.sourceCount ?? 0),
    sampleCount: Number(raw.sampleCount ?? 0),
    displayName: String(raw.displayName ?? raw.clientSessionId),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  }
}

export async function listSessions(
  settings?: ApiSettings,
): Promise<SessionSummary[]> {
  const response = await apiFetch('/v1/sessions', { method: 'GET' }, settings)
  const json: unknown = await response.json()
  if (!isRecord(json) || !Array.isArray(json.sessions)) {
    throw new ApiError('Unexpected list response from API', { code: 'invalid' })
  }
  const sessions = json.sessions.map(parseSessionSummary)
  sessions.sort((a, b) => {
    const ta = Date.parse(a.startedAt || a.createdAt) || 0
    const tb = Date.parse(b.startedAt || b.createdAt) || 0
    return tb - ta
  })
  return sessions
}

export async function getSession(
  clientSessionId: string,
  settings?: ApiSettings,
): Promise<SessionDetail> {
  const id = encodeURIComponent(clientSessionId)
  const response = await apiFetch(`/v1/sessions/${id}`, { method: 'GET' }, settings)
  const json: unknown = await response.json()
  if (!isRecord(json) || !isRecord(json.payload)) {
    throw new ApiError('Unexpected session detail from API', { code: 'invalid' })
  }
  return {
    clientSessionId: String(json.clientSessionId ?? clientSessionId),
    displayName: String(json.displayName ?? clientSessionId),
    createdAt: String(json.createdAt ?? ''),
    updatedAt: String(json.updatedAt ?? ''),
    payload: json.payload as unknown as Session,
  }
}

export async function deleteSession(
  clientSessionId: string,
  settings?: ApiSettings,
): Promise<void> {
  const id = encodeURIComponent(clientSessionId)
  const response = await apiFetch(
    `/v1/sessions/${id}`,
    { method: 'DELETE' },
    settings,
  )
  const json: unknown = await response.json().catch(() => null)
  if (
    isRecord(json) &&
    json.deleted !== true &&
    json.clientSessionId == null
  ) {
    // Some APIs return the documented shape; if body is empty but 2xx, accept.
  }
}
