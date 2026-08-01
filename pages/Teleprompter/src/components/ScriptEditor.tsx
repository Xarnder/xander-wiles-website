import { useMemo, useState } from 'react'
import { BtnLabel } from './BtnLabel'
import { AlertModal, ConfirmModal } from './Modal'
import { IconClose } from './icons'

interface ScriptEditorProps {
  script: string
  onChange: (value: string) => void
  onClose: () => void
}

function countStats(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return { words: 0, chars: 0, lines: 0 }
  const words = trimmed.split(/\s+/).filter(Boolean).length
  const lines = text.length === 0 ? 0 : text.split(/\n/).length
  return { words, chars: text.length, lines }
}

export function ScriptEditor({ script, onChange, onClose }: ScriptEditorProps) {
  const [copied, setCopied] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(
    null,
  )
  const stats = useMemo(() => countStats(script), [script])

  const onFile = async (file: File | null) => {
    if (!file) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && file.type && !file.type.startsWith('text/')) {
      setAlert({
        title: 'Import failed',
        message: 'Please import a plain .txt file.',
      })
      return
    }
    const text = await file.text()
    onChange(text)
  }

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setAlert({
        title: 'Copy failed',
        message: 'Could not copy to the clipboard. Check browser permissions.',
      })
    }
  }

  const downloadScript = () => {
    const blob = new Blob([script], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'teleprompter-script.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="script-editor-page glass-panel">
      <div className="panel-header">
        <div className="panel-header-stack">
          <h2>Edit script</h2>
          <p className="editor-stats" aria-live="polite">
            {stats.words.toLocaleString()} words · {stats.lines.toLocaleString()}{' '}
            lines · {stats.chars.toLocaleString()} chars
            <span className="editor-stats-note"> · autosaved</span>
          </p>
        </div>
        <button
          type="button"
          className="btn ghost icon-btn"
          onClick={onClose}
          title="Done"
          aria-label="Done"
        >
          <IconClose className="btn-icon" />
          <span>Done</span>
        </button>
      </div>
      <textarea
        className="script-editor-input"
        value={script}
        onChange={(e) => onChange(e.target.value)}
        spellCheck
        placeholder="Paste or type your script…"
        autoFocus
      />
      <div className="script-editor-toolbar">
        <label className="file-import glass-upload">
          <span className="file-import-label">Import .txt</span>
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" className="btn" onClick={() => void copyScript()}>
          <BtnLabel>{copied ? 'Copied' : 'Copy'}</BtnLabel>
        </button>
        <button type="button" className="btn" onClick={downloadScript}>
          <BtnLabel>Download</BtnLabel>
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            if (script.trim()) setClearOpen(true)
          }}
        >
          <BtnLabel>Clear</BtnLabel>
        </button>
      </div>

      <ConfirmModal
        open={clearOpen}
        title="Clear script?"
        message="This removes the entire script from the editor. Your autosave will update — this can’t be undone."
        confirmLabel="Clear script"
        cancelLabel="Keep script"
        tone="danger"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          onChange('')
          setClearOpen(false)
        }}
      />
      <AlertModal
        open={alert != null}
        title={alert?.title}
        message={alert?.message ?? ''}
        onClose={() => setAlert(null)}
      />
    </section>
  )
}
