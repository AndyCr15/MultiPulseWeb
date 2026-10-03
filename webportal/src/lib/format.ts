export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`
  }
  if (m > 0) {
    return `${m}m ${sec.toString().padStart(2, '0')}s`
  }
  return `${sec}s`
}

export function formatSessionTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

export function formatBpm(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(1)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }
  return `${m}:${sec.toString().padStart(2, '0')}`
}
