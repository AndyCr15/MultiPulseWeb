const STORAGE_KEY = 'multipulse.portal.apiSettings.v1'

export const DEFAULT_API_BASE = 'https://multipulseapi.andycr15.co.uk'

/** Public OAuth 2.0 Web client ID (same as Android / API). */
export const GOOGLE_WEB_CLIENT_ID =
  '98295308508-shvmkftcupektokamb9g2nfd3bkfi196.apps.googleusercontent.com'

export interface ApiSettings {
  baseUrl: string
  /** MultiPulse apiToken from POST /v1/auth/google (or manual paste). */
  token: string
  accountId: number | null
  displayName: string
  email: string
}

export function loadApiSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return emptySettings()
    }
    const parsed = JSON.parse(raw) as Partial<ApiSettings>
    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl || DEFAULT_API_BASE),
      token: typeof parsed.token === 'string' ? parsed.token.trim() : '',
      accountId:
        typeof parsed.accountId === 'number' && Number.isFinite(parsed.accountId)
          ? parsed.accountId
          : null,
      displayName:
        typeof parsed.displayName === 'string' ? parsed.displayName : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
    }
  } catch {
    return emptySettings()
  }
}

export function saveApiSettings(settings: ApiSettings): ApiSettings {
  const next: ApiSettings = {
    baseUrl: normalizeBaseUrl(settings.baseUrl || DEFAULT_API_BASE),
    token: settings.token.trim(),
    accountId: settings.accountId,
    displayName: settings.displayName.trim(),
    email: settings.email.trim(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function clearSignedInState(): ApiSettings {
  const current = loadApiSettings()
  return saveApiSettings({
    baseUrl: current.baseUrl,
    token: '',
    accountId: null,
    displayName: '',
    email: '',
  })
}

export function hasApiToken(settings: ApiSettings = loadApiSettings()): boolean {
  return settings.token.length > 0
}

export function getBearerToken(
  settings: ApiSettings = loadApiSettings(),
): string | null {
  return settings.token ? settings.token : null
}

function emptySettings(): ApiSettings {
  return {
    baseUrl: DEFAULT_API_BASE,
    token: '',
    accountId: null,
    displayName: '',
    email: '',
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
