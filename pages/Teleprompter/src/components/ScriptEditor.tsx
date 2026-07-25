interface ScriptEditorProps {
  script: string
  onChange: (value: string) => void
  onClose: () => void
}

export function ScriptEditor({ script, onChange, onClose }: ScriptEditorProps) {
  const onFile = async (file: File | null) => {
    if (!file) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && file.type && !file.type.startsWith('text/')) {
      window.alert('Please import a .txt file for v1.')
      return
    }
    const text = await file.text()
    onChange(text)
  }

  return (
    <div className="panel script-editor">
      <div className="panel-header">
        <h2>Script</h2>
        <button type="button" className="btn ghost" onClick={onClose}>
          Done
        </button>
      </div>
      <textarea
        value={script}
        onChange={(e) => onChange(e.target.value)}
        spellCheck
        placeholder="Paste or type your script…"
        rows={14}
      />
      <label className="file-import">
        <span>Import .txt</span>
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  )
}
