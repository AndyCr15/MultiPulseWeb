import { useCallback, useEffect, useMemo, useState } from 'react'
import { HrChart } from './components/HrChart'
import { ScoringControls } from './components/ScoringControls'
import { SessionHeader } from './components/SessionHeader'
import { SessionLibrary } from './components/SessionLibrary'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsPanel } from './components/StatsPanel'
import { UploadZone } from './components/UploadZone'
import { ApiError, deleteSession, getSession, listSessions } from './lib/api'
import {
  hasApiToken,
  loadApiSettings,
  type ApiSettings,
} from './lib/apiSettings'
import { build1HzTimeline } from './lib/bucket1Hz'
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

export default function App() {
  const [settings, setSettings] = useState<ApiSettings>(() => loadApiSettings())
  const [view, setView] = useState<View>(() =>
    hasApiToken(loadApiSettings()) ? 'library' : 'settings',
  )

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [session, setSession] = useState<Session | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [openBusy, setOpenBusy] = useState(false)

  const [localError, setLocalError] = useState<string | null>(null)
  const [localBusy, setLocalBusy] = useState(false)

  const [mode, setMode] = useState<ScoringMode | null>(null)
  const [showWizardReference, setShowWizardReference] = useState(true)
  const [viewRange, setViewRange] = useState<TimeRange | null>(null)

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

  const beginReview = (next: Session, title?: string) => {
    setSession(next)
    setSessionTitle(title ?? null)
    setViewRange(null)
    setOpenError(null)
    setLocalError(null)
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

  const refreshLibrary = useCallback(async (nextSettings = settings) => {
    if (!hasApiToken(nextSettings)) {
      setSessions([])
      setLibraryError(
        'API token missing. Open Settings and paste your Bearer token.',
      )
      return
    }
    setLibraryBusy(true)
    setLibraryError(null)
    try {
      const rows = await listSessions(nextSettings)
      setSessions(rows)
    } catch (err) {
      setSessions([])
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
  }, [settings])

  useEffect(() => {
    if (view === 'library' && hasApiToken(settings)) {
      void refreshLibrary(settings)
    }
  }, [view, settings, refreshLibrary])

  const openRemoteSession = async (clientSessionId: string) => {
    setOpenBusy(true)
    setOpenError(null)
    try {
      const detail = await getSession(clientSessionId, settings)
      const parsed = parseSession(detail.payload)
      beginReview(parsed, detail.displayName)
    } catch (err) {
      setOpenError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to open session',
      )
      if (err instanceof ApiError && err.code === 'unauthorized') {
        setView('settings')
      }
    } finally {
      setOpenBusy(false)
    }
  }

  const onDelete = async (clientSessionId: string, displayName: string) => {
    const ok = window.confirm(
      `Delete “${displayName}”? This cannot be undone.`,
    )
    if (!ok) return

    setDeletingId(clientSessionId)
    setLibraryError(null)
    try {
      await deleteSession(clientSessionId, settings)
      setSessions((prev) =>
        prev.filter((s) => s.clientSessionId !== clientSessionId),
      )
    } catch (err) {
      setLibraryError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to delete session',
      )
    } finally {
      setDeletingId(null)
    }
  }

  const onFile = async (file: File) => {
    setLocalBusy(true)
    setLocalError(null)
    try {
      const next = await parseSessionFile(file)
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
    setMode(null)
    setViewRange(null)
    setOpenError(null)
    setView('library')
  }

  const onSettingsSaved = (next: ApiSettings) => {
    setSettings(next)
    if (hasApiToken(next)) {
      setView('library')
    }
  }

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
              className={`chip ${view === 'library' || view === 'review' ? 'chip--active' : ''}`}
              onClick={() => {
                if (view === 'review') backToLibrary()
                else setView('library')
              }}
            >
              Sessions
            </button>
            <button
              type="button"
              className={`chip ${view === 'settings' ? 'chip--active' : ''}`}
              onClick={() => setView('settings')}
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {view === 'settings' ? (
          <SettingsPanel
            settings={settings}
            onSaved={onSettingsSaved}
            onCancel={hasApiToken(settings) ? () => setView('library') : undefined}
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
              deletingId={deletingId}
              onRefresh={() => void refreshLibrary()}
              onOpen={(id) => void openRemoteSession(id)}
              onDelete={(id, name) => void onDelete(id, name)}
              onOpenSettings={() => setView('settings')}
            />

            <details className="local-panel">
              <summary>Open a local JSON export</summary>
              <UploadZone
                onFile={onFile}
                busy={localBusy}
                error={localError}
              />
              <section className="demo-links" aria-label="Demo sessions">
                <p className="muted">Or try a sample export:</p>
                <div className="demo-links__row">
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void loadFixture('demo-two-devices.json')}
                  >
                    2-device demo
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void loadFixture('demo-three-devices.json')}
                  >
                    3-device demo (Wizard)
                  </button>
                </div>
              </section>
            </details>
          </>
        ) : null}

        {view === 'review' && session ? (
          <>
            <SessionHeader
              session={session}
              title={sessionTitle ?? undefined}
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
          MultiPulse Session Portal · session list via API · local files stay in
          this browser · <a href="../">Back to MultiPulse</a>
        </p>
      </footer>
    </div>
  )
}
