import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BtnLabel } from './BtnLabel'
import { IconClose } from './icons'

interface ModalProps {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  /** Optional footer actions (buttons). */
  footer?: ReactNode
  /** Narrower card for confirms / alerts. Wider for media review. */
  size?: 'md' | 'sm' | 'lg'
  /** Destructive accent for warning confirms. */
  tone?: 'default' | 'danger'
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  size = 'md',
  tone = 'default',
}: ModalProps) {
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const node = cardRef.current
    const focusable = node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusable?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const roots = document.querySelectorAll('.modal-root')
      const top = roots[roots.length - 1]
      const mine = node?.closest('.modal-root')
      if (top && mine && top !== mine) return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Blur lives on a clean layer — no transform / opacity animation on this node. */}
      <div className="modal-scrim" aria-hidden />
      <div
        ref={cardRef}
        className={`modal-card modal-${size} modal-tone-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="btn ghost icon-btn modal-close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <IconClose className="btn-icon" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      tone={tone}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onCancel}>
            <BtnLabel>{cancelLabel}</BtnLabel>
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            <BtnLabel>{confirmLabel}</BtnLabel>
          </button>
        </>
      }
    >
      <p className="modal-message">{message}</p>
    </Modal>
  )
}

interface AlertModalProps {
  open: boolean
  title?: string
  message: string
  /** Optional “how to fix” guidance under the main message. */
  fix?: string
  onClose: () => void
  /** Optional primary action (e.g. Retry). Falls back to a single OK. */
  actionLabel?: string
  onAction?: () => void
  dismissLabel?: string
}

export function AlertModal({
  open,
  title = 'Notice',
  message,
  fix,
  onClose,
  actionLabel,
  onAction,
  dismissLabel = 'OK',
}: AlertModalProps) {
  const hasAction = Boolean(actionLabel && onAction)

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        hasAction ? (
          <>
            <button type="button" className="btn ghost" onClick={onClose}>
              <BtnLabel>
                {dismissLabel === 'OK' ? 'Dismiss' : dismissLabel}
              </BtnLabel>
            </button>
            <button type="button" className="btn primary" onClick={onAction}>
              <BtnLabel>{actionLabel}</BtnLabel>
            </button>
          </>
        ) : (
          <button type="button" className="btn primary" onClick={onClose}>
            <BtnLabel>{dismissLabel}</BtnLabel>
          </button>
        )
      }
    >
      <p className="modal-message">{message}</p>
      {fix ? <p className="modal-fix">{fix}</p> : null}
    </Modal>
  )
}

interface StartChoiceModalProps {
  open: boolean
  recordingSupported: boolean
  onStartScriptOnly: () => void
  onStartWithRecording: () => void
  onCancel: () => void
}

/** Ask whether Start should also begin camera recording. */
export function StartChoiceModal({
  open,
  recordingSupported,
  onStartScriptOnly,
  onStartWithRecording,
  onCancel,
}: StartChoiceModalProps) {
  return (
    <Modal
      open={open}
      title="Start session"
      onClose={onCancel}
      size="sm"
      footer={
        <div className="start-choice-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
          >
            <BtnLabel>Cancel</BtnLabel>
          </button>
          <button
            type="button"
            className="btn"
            onClick={onStartScriptOnly}
          >
            <BtnLabel>Script only</BtnLabel>
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onStartWithRecording}
            disabled={!recordingSupported}
            title={
              recordingSupported
                ? 'Start following the script and begin camera recording'
                : 'Video recording is not supported in this browser'
            }
          >
            <BtnLabel>Start + Record</BtnLabel>
          </button>
        </div>
      }
    >
      <p className="modal-message">
        Do you want to start camera recording as well, or only start following
        the script?
      </p>
      <p className="modal-fix">
        You can turn this prompt off in Settings. Record stays available anytime
        from the Record button.
      </p>
    </Modal>
  )
}
