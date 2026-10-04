const STORAGE_KEY = 'multipulse.portal.apiSettings.v1'

export const DEFAULT_API_BASE = 'https://multipulseapi.andycr15.co.uk'

export interface ApiSettings {
  baseUrl: string
  token: string
}

export function loadApiSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { baseUrl: DEFAULT_API_BASE, token: '' }
    }
    const parsed = JSON.parse(raw) as Partial<ApiSettings>
    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl || DEFAULT_API_BASE),
      token: typeof parsed.token === 'string' ? parsed.token.trim() : '',
    }
  } catch {
    return { baseUrl: DEFAULT_API_BASE, token: '' }
  }
}

export function saveApiSettings(settings: ApiSettings): ApiSettings {
  const next: ApiSettings = {
    baseUrl: normalizeBaseUrl(settings.baseUrl || DEFAULT_API_BASE),
    token: settings.token.trim(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function clearApiToken(): ApiSettings {
  const current = loadApiSettings()
  return saveApiSettings({ ...current, token: '' })
}

export function hasApiToken(settings: ApiSettings = loadApiSettings()): boolean {
  return settings.token.length > 0
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
