import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecordingResult } from '../asr/useSpeechStream'
import {
  canShareRecordingFiles,
  downloadRecordingBlob,
  shareRecordingBlob,
} from '../media/platform'
import { ConfirmModal, Modal } from './Modal'

interface RecordingReviewModalProps {
  open: boolean
  recording: RecordingResult | null
  /** Close the review UI but keep the take. */
  onClose: () => void
  /** Throw away the take permanently. */
  onDiscard: () => void
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Post-take review: play the recorded shot, then Share and/or Download.
 */
export function RecordingReviewModal({
  open,
  recording,
  onClose,
  onDiscard,
}: RecordingReviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [durationSec, setDurationSec] = useState<number | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const shareAvailable = useMemo(() => canShareRecordingFiles(), [])

  const previewUrl = useMemo(() => {
    if (!open || !recording) return null
    return URL.createObjectURL(recording.blob)
  }, [open, recording])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (!open) {
      setBusy(null)
      setError(null)
      setNotice(null)
      setDurationSec(null)
      setConfirmDiscard(false)
      const el = videoRef.current
      if (el) {
        try {
          el.pause()
        } catch {
          // ignore
        }
      }
    }
  }, [open])

  if (!open || !recording || !previewUrl) return null

  const onShare = async () => {
    if (busy) return
    setBusy('share')
    setError(null)
    setNotice(null)
    try {
      await shareRecordingBlob(recording.blob, recording.filename)
      setNotice('Shared. Keep the take, or Discard once you have it saved.')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled share sheet — keep the take open.
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not share the video. Try Download instead.',
        )
      }
    } finally {
      setBusy(null)
    }
  }

  const onDownload = async () => {
    if (busy) return
    setBusy('download')
    setError(null)
    setNotice(null)
    try {
      await downloadRecordingBlob(recording.blob, recording.filename)
      setNotice('Download started. Keep the take until the file is saved.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not download the video. Try Share to Photos or Files.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Modal
        open={open}
        title="Review recording"
        onClose={onClose}
        size="lg"
        footer={
          <div className="recording-review-actions">
            <button
              type="button"
              className="btn ghost recording-review-discard"
              onClick={() => setConfirmDiscard(true)}
              disabled={busy != null}
            >
              Discard
            </button>
            <div className="recording-review-primary">
              <button
                type="button"
                className="btn ghost"
                onClick={onClose}
                disabled={busy != null}
              >
                Keep for later
              </button>
              {shareAvailable ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void onShare()}
                  disabled={busy != null}
                >
                  {busy === 'share' ? 'Sharing…' : 'Share'}
                </button>
              ) : null}
              <button
                type="button"
                className={`btn ${shareAvailable ? '' : 'primary'}`}
                onClick={() => void onDownload()}
                disabled={busy != null}
              >
                {busy === 'download' ? 'Downloading…' : 'Download'}
              </button>
            </div>
          </div>
        }
      >
        <div className="recording-review">
          <div className="recording-review-player">
            <video
              ref={videoRef}
              key={previewUrl}
              className="recording-review-video"
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration
                if (Number.isFinite(d) && d > 0) setDurationSec(d)
              }}
            />
          </div>

          <div className="recording-review-meta">
            <p className="recording-review-filename" title={recording.filename}>
              {recording.filename}
            </p>
            <p className="recording-review-stats">
              <span>{formatBytes(recording.blob.size)}</span>
              <span aria-hidden>·</span>
              <span>{formatDuration(durationSec ?? NaN)}</span>
              <span aria-hidden>·</span>
              <span>{recording.mimeType.split(';')[0] || 'video'}</span>
            </p>
            <p className="recording-review-hint">
              {shareAvailable
                ? 'Preview your take, then Share to Photos/Files or Download the file. Keep for later if you are not done yet.'
                : 'Preview your take, then Download the video file to keep it. Keep for later if you are not done yet.'}
            </p>
          </div>

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
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDiscard}
        title="Discard recording?"
        message="This take will be deleted permanently. Download or Share it first if you want to keep a copy."
        confirmLabel="Discard"
        cancelLabel="Keep reviewing"
        tone="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          onDiscard()
        }}
      />
    </>
  )
}
