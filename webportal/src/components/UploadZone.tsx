import { useCallback, useRef, useState, type DragEvent } from 'react'

interface UploadZoneProps {
  onFile: (file: File) => void
  busy?: boolean
  error?: string | null
}

export function UploadZone({ onFile, busy, error }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return
      onFile(file)
    },
    [onFile],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files?.[0])
  }

  return (
    <section className="upload" aria-labelledby="upload-heading">
      <div
        className={`upload__drop ${dragging ? 'upload__drop--active' : ''} ${error ? 'upload__drop--error' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p id="upload-heading" className="upload__title">
          Drop a MultiPulse session JSON
        </p>
        <p className="upload__hint">
          Accepts <code>multipulse-*.json</code> or{' '}
          <code>hr-comparison-*.json</code>. Data stays in your browser.
        </p>
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Loading…' : 'Choose file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>
      {error ? (
        <p className="upload__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
