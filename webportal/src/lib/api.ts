import type { ApiSettings } from './apiSettings'
import { getBearerToken, loadApiSettings } from './apiSettings'
import type { Session, SessionDetail, SessionSummary } from '../types'

/** Optional silent re-auth hook (registered from auth.ts to avoid cycles). */
let authRefreshHandler: (() => Promise<boolean>) | null = null

export function setAuthRefreshHandler(
  handler: (() => Promise<boolean>) | null,
): void {
  authRefreshHandler = handler
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'network'
  | 'http'
  | 'invalid'
  | 'invalid_google_token'
  | 'email_unverified'
  | 'google_not_configured'

export class ApiError extends Error {
  status: number | null
  code: ApiErrorCode

  constructor(
    message: string,
    opts: {
      status?: number | null
      code: ApiErrorCode
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = opts.status ?? null
    this.code = opts.code
  }
}

export interface GoogleAuthExchangeResult {
  accountId: number
  displayName: string
  email: string
  apiToken: string
  isNew: boolean
  note?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractErrorCode(body: unknown): string {
  if (!isRecord(body)) return ''
  if (typeof body.code === 'string') return body.code
  if (isRecord(body.error)) {
    if (typeof body.error.code === 'string') return body.error.code
    if (typeof body.error.message === 'string') return body.error.message
  }
  if (typeof body.error === 'string') return body.error
  if (typeof body.message === 'string') return body.message
  return ''
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback
  if (isRecord(body.error) && typeof body.error.message === 'string') {
    return body.error.message
  }
  if (typeof body.message === 'string') return body.message
  if (typeof body.error === 'string') return body.error
  if (typeof body.note === 'string') return body.note
  return fallback
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function throwForAuthExchangeFailure(response: Response, body: unknown): never {
  const apiCode = extractErrorCode(body)

  if (response.status === 401 || apiCode === 'invalid_google_token') {
    throw new ApiError(
      'Google sign-in failed (401): invalid Google ID token. Try signing in again.',
      { code: 'invalid_google_token', status: 401 },
    )
  }
  if (response.status === 403 || apiCode === 'email_unverified') {
    throw new ApiError(
      'Google account email is not verified (403). Verify the email on the Google account, then try again.',
      { code: 'email_unverified', status: 403 },
    )
  }
  if (
    response.status === 500 ||
    apiCode === 'google_not_configured'
  ) {
    throw new ApiError(
      'Server Google Sign-In is not configured (500). Check the API google client settings.',
      { code: 'google_not_configured', status: 500 },
    )
  }

  throw new ApiError(
    extractErrorMessage(body, `API error ${response.status}`),
    { code: 'http', status: response.status },
  )
}

async function rawFetch(
  path: string,
  init: RequestInit,
  settings: ApiSettings,
  withAuth: boolean,
): Promise<Response> {
  const url = `${settings.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const hasBody = init.body != null && init.body !== ''
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  // Only set JSON content-type when sending a body. Some backends 500 on
  // DELETE/GET with Content-Type: application/json and an empty body.
  if (hasBody && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (withAuth) {
    const token = getBearerToken()
    if (!token) {
      throw new ApiError(
        'Not signed in. Use Google Sign-in, or paste an API token under Advanced.',
        { code: 'unauthorized', status: 401 },
      )
    }
    headers.Authorization = `Bearer ${token}`
  }

  try {
    return await fetch(url, { ...init, headers })
  } catch {
    throw new ApiError(
      'Network error — could not reach the MultiPulse API. Check the base URL, connection, and CORS (portal origin must be allowed).',
      { code: 'network' },
    )
  }
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  settings: ApiSettings = loadApiSettings(),
  retried = false,
): Promise<Response> {
  const response = await rawFetch(path, init, settings, true)

  if (response.status === 401) {
    // Token may have been rotated by another device — try silent Google refresh once.
    if (!retried && authRefreshHandler) {
      const refreshed = await authRefreshHandler()
      if (refreshed) {
        return apiFetch(path, init, loadApiSettings(), true)
      }
    }
    throw new ApiError(
      'Signed out — your MultiPulse session expired or was replaced by another sign-in (for example on your phone). Please sign in again.',
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
    const body = await readErrorBody(response)
    const apiCode = extractErrorCode(body)
    const detail = extractErrorMessage(body, `API error ${response.status}`)
    if (response.status >= 500 || apiCode === 'server_error') {
      throw new ApiError(
        `Server error (${response.status}${apiCode ? `: ${apiCode}` : ''}) while talking to the MultiPulse API. ${detail}`,
        { code: 'http', status: response.status },
      )
    }
    throw new ApiError(detail, { code: 'http', status: response.status })
  }

  return response
}

/** Exchange a Google ID token (GIS credential JWT) for a MultiPulse apiToken. */
export async function exchangeGoogleIdToken(
  idToken: string,
  settings: ApiSettings = loadApiSettings(),
): Promise<GoogleAuthExchangeResult> {
  const response = await rawFetch(
    '/v1/auth/google',
    {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    },
    settings,
    false,
  )

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throwForAuthExchangeFailure(response, body)
  }

  if (!isRecord(body) || typeof body.apiToken !== 'string' || !body.apiToken) {
    throw new ApiError('Unexpected auth response from API (missing apiToken)', {
      code: 'invalid',
      status: response.status,
    })
  }

  return {
    accountId: Number(body.accountId ?? 0),
    displayName: String(body.displayName ?? ''),
    email: String(body.email ?? ''),
    apiToken: body.apiToken,
    isNew: Boolean(body.isNew),
    note: typeof body.note === 'string' ? body.note : undefined,
  }
}

function parseSourceNames(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.sourceNames)) {
    return raw.sourceNames
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim())
  }

  if (Array.isArray(raw.sources)) {
    const names: string[] = []
    for (const source of raw.sources) {
      if (typeof source === 'string' && source.trim()) {
        names.push(source.trim())
        continue
      }
      if (isRecord(source)) {
        const name =
          typeof source.name === 'string'
            ? source.name
            : typeof source.sourceName === 'string'
              ? source.sourceName
              : ''
        if (name.trim()) names.push(name.trim())
      }
    }
    return names
  }

  if (Array.isArray(raw.devices)) {
    return raw.devices
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim())
  }

  return []
}

function parseSessionSummary(raw: unknown): SessionSummary {
  if (!isRecord(raw)) {
    throw new ApiError('Invalid session list entry from API', { code: 'invalid' })
  }
  if (typeof raw.clientSessionId !== 'string' || !raw.clientSessionId) {
    throw new ApiError('Session missing clientSessionId', { code: 'invalid' })
  }
  const sourceNames = parseSourceNames(raw)
  const sourceCount = Number(raw.sourceCount ?? sourceNames.length)
  return {
    clientSessionId: raw.clientSessionId,
    startedAt: String(raw.startedAt ?? ''),
    endedAt: String(raw.endedAt ?? ''),
    sourceCount: Number.isFinite(sourceCount) ? sourceCount : sourceNames.length,
    sampleCount: Number(raw.sampleCount ?? 0),
    sourceNames,
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

/**
 * Rename a cloud session.
 * Uses POST (already allowed by API CORS: GET, POST, DELETE, OPTIONS).
 * API: POST /v1/sessions/{clientSessionId}/rename  body { "displayName": "..." }
 */
export async function renameSession(
  clientSessionId: string,
  displayName: string,
  settings?: ApiSettings,
): Promise<{ clientSessionId: string; displayName: string }> {
  const name = displayName.trim()
  if (!name) {
    throw new ApiError('Session name cannot be empty.', { code: 'invalid' })
  }
  const id = encodeURIComponent(clientSessionId)
  try {
    const response = await apiFetch(
      `/v1/sessions/${id}/rename`,
      {
        method: 'POST',
        body: JSON.stringify({ displayName: name }),
      },
      settings,
    )
    const json: unknown = await response.json().catch(() => null)
    if (isRecord(json) && typeof json.displayName === 'string') {
      return {
        clientSessionId: String(json.clientSessionId ?? clientSessionId),
        displayName: json.displayName,
      }
    }
    return { clientSessionId, displayName: name }
  } catch (err) {
    if (err instanceof ApiError && err.code === 'not_found') {
      throw new ApiError(
        'Rename is not available yet — the MultiPulse API has no POST /v1/sessions/{id}/rename route. Add that endpoint (body: { "displayName": "..." }), then try again.',
        { code: 'not_found', status: 404 },
      )
    }
    if (err instanceof ApiError && err.code === 'network') {
      throw new ApiError(
        'Could not rename session (network/CORS). Confirm POST /v1/sessions/{id}/rename exists and the portal origin is allowed.',
        { code: 'network' },
      )
    }
    throw err
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
  // Success may be 204 empty, or 200 with { deleted: true }.
  if (response.status === 204) return
  const json: unknown = await response.json().catch(() => null)
  if (!isRecord(json) || json.deleted !== true) {
    throw new ApiError(
      'Delete was not confirmed by the API (missing deleted: true). The session may still be on the server.',
      { code: 'http', status: response.status },
    )
  }
}

function parseUploadResult(
  json: unknown,
  session: Session,
): { clientSessionId: string; displayName: string } {
  if (!isRecord(json)) {
    return {
      clientSessionId: session.sessionId,
      displayName: session.sessionId,
    }
  }
  return {
    clientSessionId: String(json.clientSessionId ?? session.sessionId),
    displayName: String(json.displayName ?? session.sessionId),
  }
}

/**
 * Upload a MultiPulse export JSON to the cloud library (same endpoint as the Android app).
 * Tries common body shapes the API may accept.
 */
export async function uploadSession(
  session: Session,
  settings: ApiSettings = loadApiSettings(),
): Promise<{ clientSessionId: string; displayName: string }> {
  const bodies: unknown[] = [
    // Android-style: wrap export as payload with clientSessionId
    {
      clientSessionId: session.sessionId,
      payload: session,
    },
    // payload-only wrap
    { payload: session },
    // raw export JSON
    session,
  ]

  let lastError: unknown = null
  for (const body of bodies) {
    try {
      const response = await apiFetch(
        '/v1/sessions',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        settings,
      )
      if (response.status === 204) {
        return {
          clientSessionId: session.sessionId,
          displayName: session.sessionId,
        }
      }
      const json: unknown = await response.json().catch(() => null)
      return parseUploadResult(json, session)
    } catch (err) {
      lastError = err
      // Auth failures are fatal; otherwise try the next body shape.
      if (
        err instanceof ApiError &&
        (err.code === 'unauthorized' ||
          err.code === 'email_unverified' ||
          err.status === 401 ||
          err.status === 403)
      ) {
        throw err
      }
      continue
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiError('Cloud upload failed for all request shapes.', {
        code: 'http',
        status: 400,
      })
}
