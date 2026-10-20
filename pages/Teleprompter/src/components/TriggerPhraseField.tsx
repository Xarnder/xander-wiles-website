import { useEffect, useId, useState } from 'react'
import {
  isTriggerPhraseValid,
  phrasesMatch,
  triggerCaution,
} from '../bullets/promptSettings'
import { BtnLabel } from './BtnLabel'

interface TriggerPhraseFieldProps {
  value: string
  onChange: (next: string) => void
  id?: string
  label?: string
  hint?: string
  /** Another direction's phrase. Saving the same words is rejected. */
  reserved?: string
}

export function TriggerPhraseField({
  value,
  onChange,
  id,
  label = 'Trigger phrase',
  hint = 'The slide changes when this phrase is spoken. It can sit inside a normal sentence.',
  reserved,
}: TriggerPhraseFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const caution = triggerCaution(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = (raw: string) => {
    const collapsed = raw.trim().replace(/\s+/g, ' ')
    if (!isTriggerPhraseValid(collapsed)) {
      setError('Enter a trigger word or phrase.')
      return
    }
    if (reserved && phrasesMatch(collapsed, reserved)) {
      setError('Use a different phrase for each direction.')
      return
    }
    setError(null)
    if (collapsed !== value) onChange(collapsed)
  }

  return (
    <div className="trigger-field">
      <label className="settings-mic" htmlFor={fieldId}>
        <span>{label}</span>
        <input
          id={fieldId}
          className="trigger-input"
          value={draft}
          maxLength={80}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${fieldId}-error` : caution ? `${fieldId}-caution` : undefined
          }
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            commit(next)
          }}
          onBlur={() => {
            if (!isTriggerPhraseValid(draft)) {
              setDraft(value)
              setError(null)
            }
          }}
        />
      </label>
      {error ? (
        <p id={`${fieldId}-error`} className="trigger-error" role="alert">
          {error}
        </p>
      ) : caution ? (
        <p id={`${fieldId}-caution`} className="settings-hint trigger-caution">
          {caution}
        </p>
      ) : (
        <p className="settings-hint">{hint}</p>
      )}
    </div>
  )
}

/** Compact header editor. Phrases are kept only when Save is used. */
export function HeaderTriggerField({
  forward,
  back,
  onSave,
}: {
  forward: string
  back: string
  onSave: (next: { forward: string; back: string }) => void
}) {
  const forwardId = useId()
  const backId = useId()
  const [forwardDraft, setForwardDraft] = useState(forward)
  const [backDraft, setBackDraft] = useState(back)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForwardDraft(forward)
    setError(null)
  }, [forward])

  useEffect(() => {
    setBackDraft(back)
    setError(null)
  }, [back])

  const nextForward = forwardDraft.trim().replace(/\s+/g, ' ')
  const nextBack = backDraft.trim().replace(/\s+/g, ' ')
  const dirty = nextForward !== forward || nextBack !== back

  const save = () => {
    if (!isTriggerPhraseValid(nextForward) || !isTriggerPhraseValid(nextBack)) {
      setError('Enter a trigger word or phrase.')
      return
    }
    if (phrasesMatch(nextForward, nextBack)) {
      setError('Use a different phrase for each direction.')
      return
    }
    setError(null)
    if (dirty) onSave({ forward: nextForward, back: nextBack })
  }

  return (
    <form
      className="header-trigger"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <label className="header-trigger-label" htmlFor={forwardId}>
        Next
      </label>
      <input
        id={forwardId}
        className="header-trigger-input"
        value={forwardDraft}
        maxLength={80}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        title={error ?? 'Phrase that moves to the next point. Save to apply it.'}
        onChange={(event) => {
          setForwardDraft(event.target.value)
          if (error) setError(null)
        }}
      />
      <label className="header-trigger-label" htmlFor={backId}>
        Back
      </label>
      <input
        id={backId}
        className="header-trigger-input"
        value={backDraft}
        maxLength={80}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        title={error ?? 'Phrase that moves back one point. Save to apply it.'}
        onChange={(event) => {
          setBackDraft(event.target.value)
          if (error) setError(null)
        }}
      />
      <button
        type="submit"
        className="btn header-trigger-save"
        disabled={!dirty}
        title={error ?? 'Save trigger phrases'}
      >
        <BtnLabel>Save</BtnLabel>
      </button>
      {error ? (
        <span className="visually-hidden" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  )
}
