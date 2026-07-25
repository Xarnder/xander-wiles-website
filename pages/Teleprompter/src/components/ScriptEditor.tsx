import { useMemo, useState } from 'react'

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
  const stats = useMemo(() => countStats(script), [script])

  const onFile = async (file: File | null) => {
    if (!file) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && file.type && !file.type.startsWith('text/')) {
      window.alert('Please import a .txt file.')
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
      window.alert('Could not copy to clipboard.')
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

  const clearScript = () => {
    if (!script.trim()) return
    if (!window.confirm('Clear the entire script?')) return
    onChange('')
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
        <button type="button" className="btn ghost" onClick={onClose}>
          Done
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
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn" onClick={downloadScript}>
          Download
        </button>
        <button type="button" className="btn ghost" onClick={clearScript}>
          Clear
        </button>
      </div>
    </section>
  )
}
