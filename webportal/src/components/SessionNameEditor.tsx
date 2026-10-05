import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

interface SessionNameEditorProps {
  name: string
  busy?: boolean
  /** Render the name as an h2 (session review heading). */
  heading?: boolean
  /** When false, only the edit control is shown until editing starts. */
  showName?: boolean
  onRename: (nextName: string) => Promise<void> | void
}

function EditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function SessionNameEditor({
  name,
  busy,
  heading,
  showName = true,
  onRename,
}: SessionNameEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const cancel = () => {
    setDraft(name)
    setError(null)
    setEditing(false)
  }

  const save = async () => {
    const next = draft.trim()
    if (!next) {
      setError('Name cannot be empty')
      return
    }
    if (next === name) {
      setEditing(false)
      setError(null)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onRename(next)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void save()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (editing) {
    return (
      <form
        className={`name-editor name-editor--editing ${heading ? 'name-editor--heading' : ''}`}
        onSubmit={onSubmit}
      >
        <input
          ref={inputRef}
          className="name-editor__input"
          value={draft}
          disabled={saving || busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Session name"
          maxLength={120}
        />
        <button
          type="submit"
          className="button button--primary button--small"
          disabled={saving || busy}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="button button--ghost button--small"
          disabled={saving}
          onClick={cancel}
        >
          Cancel
        </button>
        {error ? (
          <span className="name-editor__error" role="alert">
            {error}
          </span>
        ) : null}
      </form>
    )
  }

  const TitleTag = heading ? 'h2' : 'span'

  return (
    <div className={`name-editor ${heading ? 'name-editor--heading' : ''}`}>
      {showName ? (
        <TitleTag
          id={heading ? 'session-heading' : undefined}
          className={heading ? 'session-meta__id' : 'name-editor__label'}
        >
          {name}
        </TitleTag>
      ) : null}
      <button
        type="button"
        className="name-editor__edit"
        title="Rename session"
        aria-label={`Rename ${name}`}
        disabled={busy || saving}
        onClick={() => setEditing(true)}
      >
        <EditIcon />
      </button>
    </div>
  )
}
