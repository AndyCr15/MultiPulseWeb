import { useCallback, useEffect, useMemo, useState } from 'react'
import { HrChart } from './components/HrChart'
import { ImportModal } from './components/ImportModal'
import { ScoringControls } from './components/ScoringControls'
import { SessionHeader } from './components/SessionHeader'
import { SessionLibrary } from './components/SessionLibrary'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsPanel } from './components/StatsPanel'
import {
  ApiError,
  deleteSession,
  getSession,
  listSessions,
  renameSession,
  uploadSession,
} from './lib/api'
import {
  clearSignedInState,
  consumeSignOutReason,
  hasApiToken,
  loadApiSettings,
  subscribeApiSettings,
  type ApiSettings,
} from './lib/apiSettings'
import { build1HzTimeline } from './lib/bucket1Hz'
import {
  clearHiddenSessions,
  hideSessionId,
  loadHiddenSessionIds,
  unhideSessionId,
} from './lib/hiddenSessions'
import { parseSession, parseSessionFile } from './lib/parseSession'
import {
  canUseSourceOfTruth,
  canUseWizard,
  fullTimelineRange,
  scoreSession,
} from './lib/scoring'
import type { ScoringMode, Session, SessionSummary, TimeRange } from './types'
import './App.css'

type View = 'library' | 'settings' | 'review'

function accountKeyFor(settings: ApiSettings): string {
  return settings.email || settings.accountId?.toString() || 'signed-in'
}

export default function App() {
  const [settings, setSettings] = useState<ApiSettings>(() => loadApiSettings())
  const [didBootNavigate, setDidBootNavigate] = useState(false)
  const [view, setView] = useState<View>(() =>
    hasApiToken(loadApiSettings()) ? 'library' : 'settings',
  )

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [hiddenCount, setHiddenCount] = useState(0)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const [session, setSession] = useState<Session | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  /** Set when the open session came from the cloud library (enables rename). */
  const [remoteClientSessionId, setRemoteClientSessionId] = useState<
    string | null
  >(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [openBusy, setOpenBusy] = useState(false)

  const [localError, setLocalError] = useState<string | null>(null)
  const [localBusy, setLocalBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [signOutReason, setSignOutReason] = useState<string | null>(() =>
    consumeSignOutReason(),
  )

  const [mode, setMode] = useState<ScoringMode | null>(null)
  const [showWizardReference, setShowWizardReference] = useState(true)
  const [viewRange, setViewRange] = useState<TimeRange | null>(null)

  const signedIn = hasApiToken(settings)

  useEffect(() => subscribeApiSettings(setSettings), [])

  const timeline = useMemo(
    () => (session ? build1HzTimeline(session) : null),
    [session],
  )

  const scoring = useMemo(() => {
    if (!session || !timeline || !mode) return null
    const range = viewRange ?? fullTimelineRange(timeline)
    return scoreSession(session, timeline, mode, range)
  }, [session, timeline, mode, viewRange])

  const onViewRangeChange = useCallback((range: TimeRange) => {
    setViewRange((prev) => {
      if (prev && prev.min === range.min && prev.max === range.max) return prev
      return range
    })
  }, [])

  const forceReSignIn = useCallback((message?: string) => {
    const reason =
      message ||
      'Signed out — your MultiPulse session expired or was replaced by another sign-in. Please sign in again.'
    const next = clearSignedInState(reason)
    setSettings(next)
    setSessions([])
    setSession(null)
    setSessionTitle(null)
    setRemoteClientSessionId(null)
    setMode(null)
    setViewRange(null)
    setLibraryError(null)
    setSignOutReason(reason)
    setView('settings')
  }, [])

  const beginReview = (
    next: Session,
    title?: string,
    clientSessionId?: string | null,
  ) => {
    setSession(next)
    setSessionTitle(title ?? null)
    setRemoteClientSessionId(clientSessionId ?? null)
    setViewRange(null)
    setOpenError(null)
    setLocalError(null)
    setImportOpen(false)
    setView('review')
    if (canUseSourceOfTruth(next.sources.length)) {
      setMode({
        type: 'sourceOfTruth',
        referenceId: next.sources[0].id,
      })
    } else {
      setMode(null)
    }
  }

  useEffect(() => {
    if (!signedIn) {
      setView('settings')
      setDidBootNavigate(false)
      return
    }
    if (!didBootNavigate) {
      setView('library')
      setDidBootNavigate(true)
    }
  }, [signedIn, didBootNavigate])

  const refreshLibrary = useCallback(async (nextSettings = settings) => {
    if (!hasApiToken(nextSettings)) {
      setSessions([])
      setHiddenCount(0)
      setLibraryError('Not signed in. Sign in with Google to load sessions.')
      return
    }
    setLibraryBusy(true)
    setLibraryError(null)
    try {
      const rows = await listSessions(nextSettings)
      const accountKey = accountKeyFor(nextSettings)
      const hidden = loadHiddenSessionIds(accountKey)
      // Drop hide markers for ids the server no longer returns.
      let pruned = false
      for (const id of [...hidden]) {
        if (!rows.some((r) => r.clientSessionId === id)) {
          unhideSessionId(accountKey, id)
          pruned = true
        }
      }
      const hiddenNow = pruned
        ? loadHiddenSessionIds(accountKey)
        : hidden
      const visible = rows.filter((r) => !hiddenNow.has(r.clientSessionId))
      setSessions(visible)
      setHiddenCount(rows.length - visible.length)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        forceReSignIn(err.message)
        return
      }
      setSessions([])
      setHiddenCount(0)
      setLibraryError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load sessions',
      )
    } finally {
      setLibraryBusy(false)
    }
  }, [settings, forceReSignIn])

  useEffect(() => {
    if (view === 'library' && signedIn) {
      void refreshLibrary(settings)
    }
  }, [view, signedIn, settings, refreshLibrary])

  const openRemoteSession = async (clientSessionId: string) => {
    setOpenBusy(true)
    setOpenError(null)
    try {
      const detail = await getSession(clientSessionId, settings)
      const parsed = parseSession(detail.payload)
      beginReview(parsed, detail.displayName, detail.clientSessionId)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        forceReSignIn(err.message)
        return
      }
      setOpenError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to open session',
      )
    } finally {
      setOpenBusy(false)
    }
  }

  const onRename = async (clientSessionId: string, displayName: string) => {
    setRenamingId(clientSessionId)
    setLibraryError(null)
    try {
      const result = await renameSession(clientSessionId, displayName, settings)
      setSessions((prev) =>
        prev.map((row) =>
          row.clientSessionId === clientSessionId
            ? { ...row, displayName: result.displayName }
            : row,
        ),
      )
      if (remoteClientSessionId === clientSessionId) {
        setSessionTitle(result.displayName)
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        forceReSignIn(err.message)
        throw err
      }
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to rename session'
      setLibraryError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setRenamingId(null)
    }
  }

  const onDelete = async (clientSessionId: string, displayName: string) => {
    const ok = window.confirm(
      `Delete “${displayName}”? This cannot be undone.`,
    )
    if (!ok) return

    setDeletingId(clientSessionId)
    setLibraryError(null)
    setLibraryNotice(null)
    const accountKey = accountKeyFor(settings)

    // Hide immediately so refresh cannot bring it back while the API is broken.
    hideSessionId(accountKey, clientSessionId)
    setSessions((prev) =>
      prev.filter((s) => s.clientSessionId !== clientSessionId),
    )
    setHiddenCount((n) => n + 1)

    try {
      await deleteSession(clientSessionId, settings)
      const rows = await listSessions(settings)
      if (rows.some((s) => s.clientSessionId === clientSessionId)) {
        setLibraryNotice(
          'Removed from this browser’s library. The API still returns this session — fix DELETE on the MultiPulse API so it stays gone for all devices.',
        )
      } else {
        unhideSessionId(accountKey, clientSessionId)
        setHiddenCount(loadHiddenSessionIds(accountKey).size)
        setLibraryNotice('Session deleted.')
      }
      const hidden = loadHiddenSessionIds(accountKey)
      setSessions(rows.filter((r) => !hidden.has(r.clientSessionId)))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        unhideSessionId(accountKey, clientSessionId)
        forceReSignIn(err.message)
        return
      }
      setLibraryError(
        err instanceof ApiError
          ? `${err.message} The session is hidden in this browser until the API delete is fixed.`
          : 'Failed to delete on the server. Hidden in this browser for now.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  const restoreHiddenSessions = () => {
    clearHiddenSessions(accountKeyFor(settings))
    setHiddenCount(0)
    setLibraryNotice(null)
    void refreshLibrary(settings)
  }

  const onFile = async (file: File) => {
    setLocalBusy(true)
    setLocalError(null)
    setLibraryNotice(null)
    try {
      const next = await parseSessionFile(file)

      if (hasApiToken(settings)) {
        const addToLibrary = window.confirm(
          'Add this session to your MultiPulse cloud library?\n\nOK = upload to your account (same as the Android app)\nCancel = open locally only',
        )
        if (addToLibrary) {
          try {
            const uploaded = await uploadSession(next, settings)
            await refreshLibrary(settings)
            setLibraryNotice(
              `Added to your cloud library as “${uploaded.displayName}”.`,
            )
            beginReview(
              next,
              uploaded.displayName,
              uploaded.clientSessionId,
            )
            return
          } catch (err) {
            if (err instanceof ApiError && err.code === 'unauthorized') {
              forceReSignIn(err.message)
              return
            }
            const message =
              err instanceof ApiError
                ? `Cloud upload failed: ${err.message}`
                : 'Cloud upload failed.'
            const openLocal = window.confirm(
              `${message}\n\nOpen the file locally anyway?`,
            )
            setLocalError(message)
            if (!openLocal) return
          }
        }
      }

      beginReview(next)
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to load session file',
      )
    } finally {
      setLocalBusy(false)
    }
  }

  const loadFixture = async (name: string) => {
    setLocalBusy(true)
    setLocalError(null)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}fixtures/${name}`)
      if (!res.ok) throw new Error(`Could not load fixture ${name}`)
      const json: unknown = await res.json()
      beginReview(parseSession(json))
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to load fixture',
      )
    } finally {
      setLocalBusy(false)
    }
  }

  const backToLibrary = () => {
    setSession(null)
    setSessionTitle(null)
    setRemoteClientSessionId(null)
    setMode(null)
    setViewRange(null)
    setOpenError(null)
    setView('library')
  }

  const onSignedIn = useCallback((next: ApiSettings) => {
    setSettings(next)
    setLibraryError(null)
    setSignOutReason(null)
    setDidBootNavigate(true)
    setView('library')
  }, [])

  const onSignedOut = useCallback((next: ApiSettings) => {
    setSettings(next)
    setSessions([])
    setSession(null)
    setSignOutReason(null)
    setDidBootNavigate(false)
    setView('settings')
  }, [])

  const onSettingsSaved = (next: ApiSettings) => {
    setSettings(next)
    if (hasApiToken(next)) {
      setDidBootNavigate(true)
      setView('library')
    } else {
      setView('settings')
    }
  }

  const accountLabel =
    settings.displayName || settings.email || (signedIn ? 'Account' : 'Sign in')

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__brand">MultiPulse</p>
            <h1>Session Portal</h1>
          </div>
          <nav className="app-nav" aria-label="Portal">
            <button
              type="button"
              className={`chip ${importOpen ? 'chip--active' : ''}`}
              onClick={() => {
                setLocalError(null)
                setImportOpen(true)
              }}
            >
              Import
            </button>
            <button
              type="button"
              className={`chip ${!importOpen && (view === 'library' || view === 'review') ? 'chip--active' : ''}`}
              onClick={() => {
                setImportOpen(false)
                if (view === 'review') backToLibrary()
                else setView('library')
              }}
              disabled={!signedIn}
            >
              Sessions
            </button>
            <button
              type="button"
              className={`chip ${!importOpen && view === 'settings' ? 'chip--active' : ''}`}
              onClick={() => {
                setImportOpen(false)
                setView('settings')
              }}
            >
              {accountLabel}
            </button>
          </nav>
        </div>
      </header>

      <ImportModal
        open={importOpen}
        busy={localBusy}
        error={localError}
        onClose={() => {
          if (!localBusy) {
            setImportOpen(false)
            setLocalError(null)
          }
        }}
        onFile={(file) => void onFile(file)}
        onLoadFixture={(name) => void loadFixture(name)}
      />

      <main className="app-main">
        {view === 'settings' ? (
          <SettingsPanel
            settings={settings}
            signOutReason={signOutReason}
            onSaved={onSettingsSaved}
            onSignedIn={onSignedIn}
            onSignedOut={onSignedOut}
            onCancel={signedIn ? () => setView('library') : undefined}
          />
        ) : null}

        {view === 'library' ? (
          <>
            {openError ? (
              <p className="upload__error" role="alert">
                {openError}
              </p>
            ) : null}
            {openBusy ? (
              <p className="notice" role="status">
                Opening session…
              </p>
            ) : null}

            <SessionLibrary
              sessions={sessions}
              busy={libraryBusy || openBusy}
              error={libraryError}
              notice={libraryNotice}
              hiddenCount={hiddenCount}
              deletingId={deletingId}
              renamingId={renamingId}
              onRefresh={() => void refreshLibrary()}
              onOpen={(id) => void openRemoteSession(id)}
              onDelete={(id, name) => void onDelete(id, name)}
              onRename={onRename}
              onRestoreHidden={restoreHiddenSessions}
            />
          </>
        ) : null}

        {view === 'review' && session ? (
          <>
            <SessionHeader
              session={session}
              title={sessionTitle ?? undefined}
              canRename={Boolean(remoteClientSessionId)}
              renameBusy={
                Boolean(
                  remoteClientSessionId &&
                    renamingId === remoteClientSessionId,
                )
              }
              onRename={
                remoteClientSessionId
                  ? (next) => onRename(remoteClientSessionId, next)
                  : undefined
              }
              onClear={backToLibrary}
            />

            {mode && canUseSourceOfTruth(session.sources.length) ? (
              <ScoringControls
                sources={session.sources}
                mode={mode}
                onChange={setMode}
                showWizardReference={showWizardReference}
                onToggleWizardReference={setShowWizardReference}
              />
            ) : (
              <p className="notice" role="status">
                Scoring needs at least two monitors. Chart still available.
              </p>
            )}

            {timeline ? (
              <HrChart
                session={session}
                timeline={timeline}
                wizardReference={
                  mode?.type === 'wizard' ? scoring?.wizardReference : null
                }
                showWizardReference={
                  mode?.type === 'wizard' &&
                  showWizardReference &&
                  canUseWizard(session.sources.length)
                }
                onViewRangeChange={onViewRangeChange}
              />
            ) : null}

            {scoring ? (
              <StatsPanel sources={session.sources} result={scoring} />
            ) : null}
          </>
        ) : null}
      </main>

      <footer className="app-footer">
        <p>
          MultiPulse Session Portal · Google Sign-In · sessions via API ·{' '}
          <a href="../">Back to MultiPulse</a>
        </p>
      </footer>
    </div>
  )
}
