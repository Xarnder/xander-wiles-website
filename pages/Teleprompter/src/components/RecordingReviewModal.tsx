import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecordingResult } from '../asr/useSpeechStream'
import {
  canShareRecordingFiles,
  downloadRecordingBlob,
  shareRecordingBlob,
} from '../media/platform'
import {
  isAlreadyMp4,
  recordingFormatLabel,
  transcodeRecordingToMp4,
} from '../media/transcodeMp4'
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

type BusyKind = 'share' | 'download' | 'convert' | null

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
  const convertAbortRef = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState<BusyKind>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [durationSec, setDurationSec] = useState<number | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [convertMessage, setConvertMessage] = useState('Preparing…')
  const [convertRatio, setConvertRatio] = useState<number | null>(null)
  const shareAvailable = useMemo(() => canShareRecordingFiles(), [])

  const previewUrl = useMemo(() => {
    if (!open || !recording) return null
    return URL.createObjectURL(recording.blob)
  }, [open, recording])

  const alreadyMp4 = useMemo(
    () =>
      recording
        ? isAlreadyMp4(recording.mimeType, recording.filename)
        : false,
    [recording],
  )

  const formatLabel = useMemo(
    () =>
      recording
        ? recordingFormatLabel(recording.mimeType, recording.filename)
        : 'VIDEO',
    [recording],
  )

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (!open) {
      convertAbortRef.current?.abort()
      convertAbortRef.current = null
      setBusy(null)
      setError(null)
      setNotice(null)
      setDurationSec(null)
      setConfirmDiscard(false)
      setDownloadOpen(false)
      setConvertOpen(false)
      setConvertMessage('Preparing…')
      setConvertRatio(null)
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

  const downloadOriginal = async () => {
    if (busy) return
    setBusy('download')
    setError(null)
    setNotice(null)
    setDownloadOpen(false)
    try {
      await downloadRecordingBlob(recording.blob, recording.filename)
      setNotice(
        `Download started (${formatLabel}). Keep the take until the file is saved.`,
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled save picker.
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not download the video. Try Share to Photos or Files.',
        )
      }
    } finally {
      setBusy(null)
    }
  }

  const downloadAsMp4 = async () => {
    if (busy) return
    setDownloadOpen(false)
    setError(null)
    setNotice(null)

    if (alreadyMp4) {
      setBusy('download')
      try {
        await downloadRecordingBlob(recording.blob, recording.filename)
        setNotice('Download started (MP4). Keep the take until the file is saved.')
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not download the MP4.',
          )
        }
      } finally {
        setBusy(null)
      }
      return
    }

    const abort = new AbortController()
    convertAbortRef.current = abort
    setBusy('convert')
    setConvertOpen(true)
    setConvertMessage('Loading video converter…')
    setConvertRatio(null)

    try {
      const converted = await transcodeRecordingToMp4(
        recording.blob,
        recording.filename,
        {
          signal: abort.signal,
          onProgress: ({ ratio, message }) => {
            setConvertRatio(ratio)
            setConvertMessage(message)
          },
        },
      )
      setConvertMessage('Starting download…')
      await downloadRecordingBlob(converted.blob, converted.filename)
      setConvertOpen(false)
      setNotice(
        'MP4 download started. Keep the take until the file is saved.',
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setConvertOpen(false)
        setNotice('MP4 conversion cancelled.')
      } else {
        setConvertOpen(false)
        setError(
          err instanceof Error
            ? err.message
            : 'Could not convert to MP4. Try downloading the original format.',
        )
      }
    } finally {
      convertAbortRef.current = null
      setBusy(null)
    }
  }

  const cancelConvert = () => {
    convertAbortRef.current?.abort()
  }

  const reviewBlocked = busy != null

  return (
    <>
      <Modal
        open={open && !convertOpen}
        title="Review recording"
        onClose={onClose}
        size="lg"
        footer={
          <div className="recording-review-actions">
            <button
              type="button"
              className="btn ghost recording-review-discard"
              onClick={() => setConfirmDiscard(true)}
              disabled={reviewBlocked}
            >
              Discard
            </button>
            <div className="recording-review-primary">
              <button
                type="button"
                className="btn ghost"
                onClick={onClose}
                disabled={reviewBlocked}
              >
                Keep for later
              </button>
              {shareAvailable ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void onShare()}
                  disabled={reviewBlocked}
                >
                  {busy === 'share' ? 'Sharing…' : 'Share'}
                </button>
              ) : null}
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setError(null)
                  setDownloadOpen(true)
                }}
                disabled={reviewBlocked}
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
              <span>
                {formatDuration(durationSec ?? recording.elapsedMs / 1000)}
              </span>
              <span aria-hidden>·</span>
              <span>{formatLabel}</span>
            </p>
            <p className="recording-review-hint">
              Preview the full take, then Share or Download. Download can keep
              the original {formatLabel}
              {alreadyMp4 ? '' : ' or convert to MP4 first'}.
            </p>
            {durationSec != null &&
            recording.elapsedMs > 1500 &&
            durationSec * 1000 < recording.elapsedMs * 0.75 ? (
              <p className="recording-review-error" role="alert">
                This file looks shorter than the take (
                {formatDuration(recording.elapsedMs / 1000)} recorded). Try
                another take and keep the app in the foreground until Saving…
                finishes.
              </p>
            ) : null}
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

      <Modal
        open={downloadOpen}
        title="Download recording"
        onClose={() => setDownloadOpen(false)}
        size="sm"
        footer={
          <div className="recording-download-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => setDownloadOpen(false)}
            >
              Cancel
            </button>
            {alreadyMp4 ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => void downloadOriginal()}
              >
                Download MP4
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void downloadOriginal()}
                >
                  Download {formatLabel}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void downloadAsMp4()}
                >
                  Convert to MP4
                </button>
              </>
            )}
          </div>
        }
      >
        <p className="modal-message">
          {alreadyMp4
            ? 'This take is already MP4. Choose where to save it.'
            : `Keep the original ${formatLabel} file, or re-encode to MP4 for wider compatibility (Photos, editing apps, etc.).`}
        </p>
        {!alreadyMp4 ? (
          <p className="recording-convert-hint">
            Converting downloads a one-time converter (~30MB) the first time,
            then shows a progress screen while it re-encodes.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={convertOpen}
        title="Converting to MP4"
        onClose={cancelConvert}
        size="sm"
        footer={
          <div className="recording-download-actions">
            <button type="button" className="btn ghost" onClick={cancelConvert}>
              Cancel
            </button>
          </div>
        }
      >
        <div className="recording-convert">
          <p className="modal-message">{convertMessage}</p>
          <div
            className="recording-convert-meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              convertRatio == null ? undefined : Math.round(convertRatio * 100)
            }
            aria-label="MP4 conversion progress"
          >
            <div
              className={`recording-convert-fill${convertRatio == null ? ' is-indeterminate' : ''}`}
              style={
                convertRatio == null
                  ? undefined
                  : { width: `${Math.round(convertRatio * 100)}%` }
              }
            />
          </div>
          <p className="recording-convert-hint">
            Keep this tab open until conversion finishes. You can cancel and
            download the original {formatLabel} instead.
          </p>
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
