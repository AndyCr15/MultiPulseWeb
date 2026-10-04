/**
 * Client-side hide list for sessions the user deleted in the portal but the
 * API failed to remove (or still returns in GET /v1/sessions).
 * Scoped per account email when available.
 */

const STORAGE_PREFIX = 'multipulse.portal.hiddenSessions.v1'

function storageKey(accountKey: string): string {
  return `${STORAGE_PREFIX}:${accountKey || 'anonymous'}`
}

export function loadHiddenSessionIds(accountKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(accountKey))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((id): id is string => typeof id === 'string' && id.length > 0),
    )
  } catch {
    return new Set()
  }
}

export function saveHiddenSessionIds(
  accountKey: string,
  ids: Set<string>,
): void {
  localStorage.setItem(storageKey(accountKey), JSON.stringify([...ids]))
}

export function hideSessionId(accountKey: string, clientSessionId: string): void {
  const ids = loadHiddenSessionIds(accountKey)
  ids.add(clientSessionId)
  saveHiddenSessionIds(accountKey, ids)
}

export function unhideSessionId(
  accountKey: string,
  clientSessionId: string,
): void {
  const ids = loadHiddenSessionIds(accountKey)
  ids.delete(clientSessionId)
  saveHiddenSessionIds(accountKey, ids)
}

export function clearHiddenSessions(accountKey: string): void {
  localStorage.removeItem(storageKey(accountKey))
}
