import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** Where the live cursor should sit in the viewport. */
export type ScrollAnchorMode = 'top' | 'middle' | 'hybrid'

export interface ScrollControllerOptions {
  /**
   * top — keep the active word near the top of the viewport
   * middle — keep it vertically centered
   * hybrid — stay at scroll 0 until the word reaches mid-viewport, then pin center
   */
  anchorMode?: ScrollAnchorMode
  /** Extra scroll speed multiplier (user sensitivity). */
  sensitivity?: number
  /**
   * When true, auto-scroll drives the container (live scroll).
   * When false, the user can scroll freely — the rAF loop will not touch scrollTop.
   */
  active?: boolean
}

const FOCUS_RATIO: Record<ScrollAnchorMode, number> = {
  top: 0.12,
  middle: 0.5,
  // Hybrid uses middle once scrolling begins; clamp-to-0 keeps early words at top.
  hybrid: 0.5,
}

/**
 * Smooth scroll toward the active word via rAF — only while `active` (live scroll).
 * When inactive (paused / off-script hold), manual scrolling is unrestricted.
 */
export function useScrollController(
  containerRef: RefObject<HTMLElement | null>,
  options: ScrollControllerOptions = {},
) {
  const anchorModeRef = useRef<ScrollAnchorMode>(options.anchorMode ?? 'hybrid')
  anchorModeRef.current = options.anchorMode ?? 'hybrid'

  const sensitivityRef = useRef(options.sensitivity ?? 1)
  sensitivityRef.current = options.sensitivity ?? 1

  const activeRef = useRef(options.active ?? false)
  const wasActiveRef = useRef(activeRef.current)

  const targetYRef = useRef(0)
  const currentYRef = useRef(0)
  const rafRef = useRef<number>(0)
  const lastTsRef = useRef<number>(0)
  const lastCursorRef = useRef(0)
  const lastCursorTsRef = useRef(0)
  const wpsRef = useRef(2.5) // words per second estimate

  // Keep active flag in sync; when entering live mode, adopt the user's scroll position
  // so we don't yank the viewport.
  useEffect(() => {
    const next = options.active ?? false
    const el = containerRef.current
    if (next && !wasActiveRef.current && el) {
      currentYRef.current = el.scrollTop
      targetYRef.current = el.scrollTop
    }
    activeRef.current = next
    wasActiveRef.current = next
  }, [containerRef, options.active])

  const tick = useCallback((ts: number) => {
    const el = containerRef.current
    if (!el) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const last = lastTsRef.current || ts
    const dt = Math.min(0.05, (ts - last) / 1000)
    lastTsRef.current = ts

    if (!activeRef.current) {
      // Paused / unlocked: leave scrollTop alone so the user can scroll freely.
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const current = currentYRef.current
    const target = targetYRef.current
    const diff = target - current

    const wps = wpsRef.current
    const baseCatchUp =
      1 - Math.exp(-dt * (3.2 + wps * 0.55) * sensitivityRef.current)
    const maxStep = (80 + wps * 90) * sensitivityRef.current * dt
    let step = diff * baseCatchUp
    if (Math.abs(step) > maxStep) {
      step = Math.sign(step) * maxStep
    }

    if (Math.abs(diff) < 0.4) {
      currentYRef.current = target
    } else {
      currentYRef.current = current + step
    }

    el.scrollTop = currentYRef.current

    rafRef.current = requestAnimationFrame(tick)
  }, [containerRef])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [tick])

  const syncFromDom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    currentYRef.current = el.scrollTop
    targetYRef.current = el.scrollTop
  }, [containerRef])

  const setCursor = useCallback(
    (cursor: number, wordEl: HTMLElement | null) => {
      // Ignore target updates while unlocked — prevents stale targets snapping on resume.
      if (!activeRef.current) return

      const now = performance.now()
      const prevCursor = lastCursorRef.current
      const prevTs = lastCursorTsRef.current
      if (cursor !== prevCursor && prevTs > 0) {
        const dtSec = (now - prevTs) / 1000
        const advanced = Math.max(0, cursor - prevCursor)
        if (dtSec > 0.05 && advanced > 0) {
          const instant = advanced / dtSec
          wpsRef.current = wpsRef.current * 0.7 + instant * 0.3
          wpsRef.current = Math.max(0.6, Math.min(6.5, wpsRef.current))
        }
      }
      lastCursorRef.current = cursor
      lastCursorTsRef.current = now

      const container = containerRef.current
      if (!container || !wordEl) return

      const containerRect = container.getBoundingClientRect()
      const wordRect = wordEl.getBoundingClientRect()
      const offsetWithin =
        wordRect.top - containerRect.top + container.scrollTop
      const ratio = FOCUS_RATIO[anchorModeRef.current]
      const focusY = offsetWithin - container.clientHeight * ratio
      // Hybrid & early top/middle: clamp keeps the first lines at the top until
      // the active word reaches the focus line, then scrolls to hold it there.
      targetYRef.current = Math.max(0, focusY)
    },
    [containerRef],
  )

  const reset = useCallback(() => {
    targetYRef.current = 0
    currentYRef.current = 0
    lastCursorRef.current = 0
    lastCursorTsRef.current = 0
    wpsRef.current = 2.5
    const el = containerRef.current
    if (el) el.scrollTop = 0
  }, [containerRef])

  return { setCursor, reset, syncFromDom }
}
