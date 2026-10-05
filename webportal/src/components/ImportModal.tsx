import { useEffect, useRef } from 'react'
import { UploadZone } from './UploadZone'

interface ImportModalProps {
  open: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onFile: (file: File) => void
  onLoadFixture: (name: string) => void
}

export function ImportModal({
  open,
  busy,
  error,
  onClose,
  onFile,
  onLoadFixture,
}: ImportModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, busy, onClose])

  if (!open) return null

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        <div className="modal__header">
          <div>
            <p className="eyebrow">Import</p>
            <h2 id="import-modal-title">Open a local JSON export</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="button button--ghost button--small"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>

        <UploadZone onFile={onFile} busy={busy} error={error} />

        <section className="demo-links" aria-label="Demo sessions">
          <p className="muted">Or try a sample export:</p>
          <div className="demo-links__row">
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={() => onLoadFixture('demo-two-devices.json')}
            >
              2-device demo
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={() => onLoadFixture('demo-three-devices.json')}
            >
              3-device demo (Wizard)
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
