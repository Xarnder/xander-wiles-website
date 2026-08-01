import { useEffect, useState } from 'react'
import type { RecordingResult } from '../asr/useSpeechStream'
import { downloadRecordingBlob } from '../media/platform'
import { Modal } from './Modal'
import { BtnLabel } from './BtnLabel'

interface ReplaceRecordingModalProps {
  open: boolean
  recording: RecordingResult | null
  onCancel: () => void
  onConfirmReplace: () => void
  onReviewOld?: () => void
}

/**
 * Asked when starting a new take while a previous recording is still kept.
 */
export function ReplaceRecordingModal({
  open,
  recording,
  onCancel,
  onConfirmReplace,
  onReviewOld,
}: ReplaceRecordingModalProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBusy(false)
      setError(null)
      setNotice(null)
    }
  }, [open])

  if (!open || !recording) return null

  const onDownload = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await downloadRecordingBlob(recording.blob, recording.filename)
      setNotice('Download started for the old take.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not download the old recording.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Replace recording?"
      onClose={onCancel}
      size="sm"
      tone="danger"
      footer={
        <div className="replace-recording-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={busy}
          >
            <BtnLabel>Cancel</BtnLabel>
          </button>
          {onReviewOld ? (
            <button
              type="button"
              className="btn ghost"
              onClick={onReviewOld}
              disabled={busy}
            >
              <BtnLabel>Review old</BtnLabel>
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={() => void onDownload()}
            disabled={busy}
          >
            <BtnLabel>{busy ? 'Downloading…' : 'Download old'}</BtnLabel>
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={onConfirmReplace}
            disabled={busy}
          >
            <BtnLabel>Clear & record</BtnLabel>
          </button>
        </div>
      }
    >
      <p className="modal-message">
        You already have a recording
        {recording.filename ? (
          <>
            {' '}
            (<span className="replace-recording-name">{recording.filename}</span>)
          </>
        ) : null}
        . Starting a new take will clear it.
      </p>
      <p className="modal-fix">
        Review or download the old recording first if you want to keep it, then
        tap Clear &amp; record.
      </p>
      {notice ? (
        <p className="recording-review-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="recording-review-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
