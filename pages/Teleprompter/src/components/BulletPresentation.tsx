import { useLayoutEffect, useRef } from 'react'

interface BulletPresentationProps {
  current: string
  nextBullet: string | null
  index: number
  count: number
  trigger: string
  backTrigger: string
  fontSize: number
  lineWidth: number
  lineHeight: number
  mirror: boolean
  showNext: boolean
}

export function BulletPresentation({
  current,
  nextBullet,
  index,
  count,
  trigger,
  backTrigger,
  fontSize: _fontSize,
  lineWidth: _lineWidth,
  lineHeight,
  mirror,
  showNext,
}: BulletPresentationProps) {
  const position = count === 0 ? 0 : index + 1
  const leading = lineHeight <= 0 ? 1.08 : lineHeight
  const phrase = trigger.trim() || 'next slide'
  const backPhrase = backTrigger.trim() || 'backwards slide'
  const onFirst = count > 0 && index === 0
  const stageRef = useRef<HTMLElement>(null)
  const cueRef = useRef<HTMLParagraphElement>(null)
  const currentRef = useRef<HTMLHeadingElement>(null)
  const nextRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    const heading = currentRef.current
    if (!stage || !heading) return

    const fit = () => {
      fitBulletSlide({
        stage,
        cue: cueRef.current,
        current: heading,
        next: showNext ? nextRef.current : null,
        lineHeight: leading,
      })
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    const header = stage.closest('.app-shell')?.querySelector('header.controls')
    if (header) observer.observe(header)
    const root = document.documentElement
    const mutations = new MutationObserver(fit)
    mutations.observe(root, {
      attributes: true,
      attributeFilter: ['data-bold-script'],
    })
    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [current, nextBullet, showNext, onFirst, phrase, backPhrase, leading, count])

  return (
    <section
      ref={stageRef}
      className="bullet-stage"
      data-mirrored={mirror ? 'true' : undefined}
      data-first={onFirst ? 'true' : undefined}
      aria-label="Bulletpoint presentation"
      style={{ ['--bullet-leading' as string]: String(leading) }}
    >
      {onFirst ? (
        <p ref={cueRef} className="bullet-trigger-cue">
          <span>Next “{phrase}”</span>
          <span>Back “{backPhrase}”</span>
        </p>
      ) : null}

      <div className="bullet-copy">
        {count === 0 ? (
          <h2 ref={currentRef} className="bullet-current bullet-empty">
            Add bullet points to begin
          </h2>
        ) : (
          <h2 ref={currentRef} className="bullet-current">
            {current}
          </h2>
        )}
        <p className="visually-hidden" aria-live="polite">
          {count === 0
            ? 'No bullet points yet.'
            : `Point ${position} of ${count}. ${current}`}
        </p>
      </div>

      {showNext && nextBullet ? (
        <p ref={nextRef} className="bullet-next">
          {nextBullet}
        </p>
      ) : null}
    </section>
  )
}

const MIN_CURRENT = 16
const MIN_NEXT = 13

function readPx(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Compact chrome sits on top of the stage. Pad the stage so fitted text
 * starts below that bar instead of sliding underneath it.
 */
function clearChromeOverlap(stage: HTMLElement): void {
  stage.style.paddingTop = ''
  stage.style.paddingBottom = ''
  const styled = getComputedStyle(stage)
  const cssTop = readPx(styled.paddingTop)
  const cssBottom = readPx(styled.paddingBottom)
  const header = stage.closest('.app-shell')?.querySelector('header.controls')
  const stageRect = stage.getBoundingClientRect()
  const headerRect = header?.getBoundingClientRect()
  let overlapTop = 0
  let overlapBottom = 0
  if (
    headerRect &&
    headerRect.width > 0 &&
    headerRect.height > 0 &&
    headerRect.left < stageRect.right &&
    headerRect.right > stageRect.left
  ) {
    const gap = 8
    if (headerRect.bottom > stageRect.top + 1 && headerRect.top < stageRect.top + stageRect.height * 0.5) {
      overlapTop = headerRect.bottom - stageRect.top + gap
    }
    if (headerRect.top < stageRect.bottom - 1 && headerRect.bottom > stageRect.top + stageRect.height * 0.5) {
      overlapBottom = stageRect.bottom - headerRect.top + gap
    }
  }
  if (overlapTop > cssTop) stage.style.paddingTop = `${overlapTop}px`
  if (overlapBottom > cssBottom) stage.style.paddingBottom = `${overlapBottom}px`
}

function applySize(el: HTMLElement, size: number): void {
  el.style.fontSize = `${size}px`
  el.style.overflowWrap = 'normal'
  if (el.scrollWidth > el.clientWidth + 1) el.style.overflowWrap = 'anywhere'
}

function fitsBox(el: HTMLElement, maxHeight: number): boolean {
  return el.scrollHeight <= maxHeight + 1 && el.scrollWidth <= el.clientWidth + 1
}

/** Largest size in [min, max] whose text stays inside maxHeight. */
function largestThatFits(
  el: HTMLElement,
  maxHeight: number,
  min: number,
  max: number,
): number {
  let lo = min
  let hi = Math.max(min, max)
  let best = min
  for (let pass = 0; pass < 14; pass++) {
    const mid = (lo + hi) / 2
    applySize(el, mid)
    if (fitsBox(el, maxHeight)) {
      best = mid
      lo = mid
    } else {
      hi = mid
    }
  }
  applySize(el, best)
  return best
}

/**
 * Give this slide the largest type that still shows every line, including the
 * next-point preview. Short points grow; long points shrink on their own.
 */
function fitBulletSlide(input: {
  stage: HTMLElement
  cue: HTMLElement | null
  current: HTMLElement
  next: HTMLElement | null
  lineHeight: number
}): void {
  const { stage, cue, current, next, lineHeight } = input
  if (stage.clientWidth === 0 || stage.clientHeight === 0) return

  clearChromeOverlap(stage)

  const style = getComputedStyle(stage)
  const padY = readPx(style.paddingTop) + readPx(style.paddingBottom)
  const gap = readPx(style.rowGap) || readPx(style.gap)
  const box = Math.max(0, stage.clientHeight - padY - 2)
  const slots = 1 + (cue ? 1 : 0) + (next ? 1 : 0)
  const gaps = gap * Math.max(0, slots - 1)
  const cueHeight = cue?.offsetHeight ?? 0
  const room = Math.max(0, box - cueHeight - gaps)
  const currentMax = Math.max(MIN_CURRENT, room / Math.max(lineHeight, 0.8))

  let bestCurrent = MIN_CURRENT
  let bestNext = MIN_NEXT
  let lo = MIN_CURRENT
  let hi = currentMax

  for (let pass = 0; pass < 14; pass++) {
    const mid = (lo + hi) / 2
    applySize(current, mid)
    if (!fitsBox(current, room)) {
      hi = mid
      continue
    }
    if (!next) {
      bestCurrent = mid
      lo = mid
      continue
    }
    const left = room - current.scrollHeight
    const nextMax = Math.min(mid * 0.5, 64, Math.max(MIN_NEXT, left))
    const nextSize = largestThatFits(next, left, MIN_NEXT, nextMax)
    if (fitsBox(next, left)) {
      bestCurrent = mid
      bestNext = nextSize
      lo = mid
    } else {
      hi = mid
    }
  }

  applySize(current, bestCurrent)
  if (next) applySize(next, bestNext)

  const used = cueHeight + current.scrollHeight + (next?.scrollHeight ?? 0) + gaps
  stage.dataset.overflow = used > box + 2 ? 'scroll' : 'hidden'
}
