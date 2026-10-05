import { useState } from 'react'
import { formatBpm, formatDuration, formatSessionTime } from '../lib/format'
import type { SessionSummary } from '../types'
import { SessionNameEditor } from './SessionNameEditor'

interface SessionLibraryProps {
  sessions: SessionSummary[]
  busy: boolean
  error: string | null
  notice?: string | null
  hiddenCount?: number
  deletingId: string | null
  renamingId?: string | null
  onRefresh: () => void
  onOpen: (clientSessionId: string) => void
  onDelete: (clientSessionId: string, displayName: string) => void
  onRename: (clientSessionId: string, displayName: string) => Promise<void>
  onRestoreHidden?: () => void
}

type SortKey = 'name' | 'started' | 'duration' | 'avgHr' | 'devices'
type SortDir = 'asc' | 'desc'

function durationSeconds(startedAt: string, endedAt: string): number | null {
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return (end - start) / 1000
}

function durationLabel(startedAt: string, endedAt: string): string {
  const sec = durationSeconds(startedAt, endedAt)
  if (sec === null) return '—'
  return formatDuration(sec)
}

function devicesLabel(row: SessionSummary): string {
  if (row.sourceNames.length > 0) return row.sourceNames.join(', ')
  if (row.sourceCount > 0) {
    return `${row.sourceCount} device${row.sourceCount === 1 ? '' : 's'}`
  }
  return '—'
}

function startedMs(row: SessionSummary): number {
  return Date.parse(row.startedAt || row.createdAt) || 0
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return dir === 'asc' ? a - b : b - a
}

function compareSessions(
  a: SessionSummary,
  b: SessionSummary,
  key: SortKey,
  dir: SortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1
  switch (key) {
    case 'name': {
      const cmp = a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: 'base',
      })
      return cmp * sign
    }
    case 'started':
      return (startedMs(a) - startedMs(b)) * sign
    case 'duration':
      return compareNullableNumber(
        durationSeconds(a.startedAt, a.endedAt),
        durationSeconds(b.startedAt, b.endedAt),
        dir,
      )
    case 'avgHr':
      return compareNullableNumber(a.averageBpm, b.averageBpm, dir)
    case 'devices': {
      const cmp = devicesLabel(a).localeCompare(devicesLabel(b), undefined, {
        sensitivity: 'base',
      })
      return cmp * sign
    }
  }
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  column: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (column: SortKey) => void
}) {
  const active = sortKey === column
  const ariaSort = active
    ? sortDir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none'

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button
        type="button"
        className={`library__sort ${active ? 'library__sort--active' : ''}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="library__sort-indicator" aria-hidden="true">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '◇'}
        </span>
      </button>
    </th>
  )
}

export function SessionLibrary({
  sessions,
  busy,
  error,
  notice,
  hiddenCount = 0,
  deletingId,
  renamingId,
  onRefresh,
  onOpen,
  onDelete,
  onRename,
  onRestoreHidden,
}: SessionLibraryProps) {
  const [sortKey, setSortKey] = useState<SortKey>('started')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const onSort = (column: SortKey) => {
    if (column === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(column)
    // Dates/numbers default to newest/highest first; names/devices A→Z.
    setSortDir(
      column === 'name' || column === 'devices' ? 'asc' : 'desc',
    )
  }

  const sorted = [...sessions].sort((a, b) => {
    const primary = compareSessions(a, b, sortKey, sortDir)
    if (primary !== 0) return primary
    // Stable-ish tie-break: latest session first.
    return startedMs(b) - startedMs(a)
  })

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
        </div>
      </div>

      {error ? (
        <p className="upload__error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="library__notice" role="status">
          {notice}
        </p>
      ) : null}

      {hiddenCount > 0 ? (
        <p className="library__hidden" role="status">
          {hiddenCount} deleted session{hiddenCount === 1 ? '' : 's'} hidden in
          this browser (API delete is failing or incomplete).{' '}
          {onRestoreHidden ? (
            <button
              type="button"
              className="library__text-btn"
              onClick={onRestoreHidden}
            >
              Show again
            </button>
          ) : null}
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
                <SortHeader
                  label="Session"
                  column="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortHeader
                  label="Started"
                  column="started"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortHeader
                  label="Duration"
                  column="duration"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortHeader
                  label="Avg HR"
                  column="avgHr"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortHeader
                  label="Devices"
                  column="devices"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.clientSessionId}>
                  <td>
                    <div className="library__name-cell">
                      <button
                        type="button"
                        className="library__link"
                        onClick={() => onOpen(row.clientSessionId)}
                      >
                        {row.displayName}
                      </button>
                      <SessionNameEditor
                        name={row.displayName}
                        showName={false}
                        busy={
                          busy ||
                          deletingId === row.clientSessionId ||
                          renamingId === row.clientSessionId
                        }
                        onRename={(next) => onRename(row.clientSessionId, next)}
                      />
                    </div>
                  </td>
                  <td>{formatSessionTime(row.startedAt)}</td>
                  <td>{durationLabel(row.startedAt, row.endedAt)}</td>
                  <td>
                    {row.averageBpm === null
                      ? '—'
                      : `${formatBpm(row.averageBpm)} bpm`}
                  </td>
                  <td className="library__devices">{devicesLabel(row)}</td>
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
