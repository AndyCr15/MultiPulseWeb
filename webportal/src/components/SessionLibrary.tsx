import { formatDuration, formatSessionTime } from '../lib/format'
import type { SessionSummary } from '../types'

interface SessionLibraryProps {
  sessions: SessionSummary[]
  busy: boolean
  error: string | null
  deletingId: string | null
  onRefresh: () => void
  onOpen: (clientSessionId: string) => void
  onDelete: (clientSessionId: string, displayName: string) => void
  onOpenSettings: () => void
}

function durationLabel(startedAt: string, endedAt: string): string {
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—'
  return formatDuration((end - start) / 1000)
}

export function SessionLibrary({
  sessions,
  busy,
  error,
  deletingId,
  onRefresh,
  onOpen,
  onDelete,
  onOpenSettings,
}: SessionLibraryProps) {
  return (
    <section className="library" aria-labelledby="library-heading">
      <div className="library__header">
        <div>
          <p className="eyebrow">Cloud library</p>
          <h2 id="library-heading">Sessions</h2>
        </div>
        <div className="library__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={onRefresh}
            disabled={busy}
          >
            {busy ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={onOpenSettings}
          >
            Settings
          </button>
        </div>
      </div>

      {error ? (
        <p className="upload__error" role="alert">
          {error}
        </p>
      ) : null}

      {!busy && !error && sessions.length === 0 ? (
        <p className="library__empty">
          No sessions yet. Upload from the MultiPulse Android app, then refresh.
        </p>
      ) : null}

      {sessions.length > 0 ? (
        <div className="library__table-wrap">
          <table className="library__table">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Started</th>
                <th scope="col">Duration</th>
                <th scope="col">Devices</th>
                <th scope="col">Samples</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => (
                <tr key={row.clientSessionId}>
                  <td>
                    <button
                      type="button"
                      className="library__link"
                      onClick={() => onOpen(row.clientSessionId)}
                    >
                      {row.displayName}
                    </button>
                  </td>
                  <td>{formatSessionTime(row.startedAt)}</td>
                  <td>{durationLabel(row.startedAt, row.endedAt)}</td>
                  <td>{row.sourceCount}</td>
                  <td>{row.sampleCount.toLocaleString()}</td>
                  <td className="library__row-actions">
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => onOpen(row.clientSessionId)}
                      disabled={busy || deletingId === row.clientSessionId}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="button button--danger button--small"
                      onClick={() =>
                        onDelete(row.clientSessionId, row.displayName)
                      }
                      disabled={busy || deletingId === row.clientSessionId}
                    >
                      {deletingId === row.clientSessionId
                        ? 'Deleting…'
                        : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
