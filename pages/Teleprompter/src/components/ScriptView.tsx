import type { CSSProperties, RefObject } from 'react'
import type { ScriptWord } from '../utils/tokenize'
import type { AlignmentState } from '../alignment/AlignmentEngine'
import type {
  DisplayMode,
  SentenceBreakMode,
  ScrollAnchorMode,
} from '../hooks/useTeleprompter'
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../hooks/useTeleprompter'

interface ScriptViewProps {
  script: string
  words: readonly ScriptWord[]
  cursor: number
  alignState: AlignmentState
  fontSize: number
  lineWidth: number
  mirror: boolean
  preserveBreaks: boolean
  sentenceBreak: SentenceBreakMode
  displayMode: DisplayMode
  showCursorHighlight: boolean
  scrollAnchor: ScrollAnchorMode
  onSeek?: (index: number) => void
  containerRef: RefObject<HTMLDivElement | null>
  registerWordRef: (index: number, el: HTMLSpanElement | null) => void
}

type BreakKind = 'space' | 'tab' | 'line' | 'paragraph'

/** True when a full stop appears between this word and the next (or at end of script). */
function endsWithFullStop(
  script: string,
  word: ScriptWord,
  next: ScriptWord | undefined,
): boolean {
  const between = next
    ? script.slice(word.end, next.start)
    : script.slice(word.end)
  // Sentence period — not part of the tokenized word (punctuation lives in the gap).
  return /\./.test(between)
}

function breakAfterWord(
  script: string,
  word: ScriptWord,
  next: ScriptWord | undefined,
  preserveBreaks: boolean,
  sentenceBreak: SentenceBreakMode,
): BreakKind {
  if (!next) return 'space'

  let br: BreakKind = 'space'
  if (preserveBreaks) {
    const between = script.slice(word.end, next.start)
    if (/\n\s*\n/.test(between)) br = 'paragraph'
    else if (/\n/.test(between)) br = 'line'
  }

  if (
    sentenceBreak !== 'off' &&
    endsWithFullStop(script, word, next) &&
    br === 'space'
  ) {
    br = sentenceBreak === 'tab' ? 'tab' : 'line'
  }

  return br
}

/** Map font-size slider into a focus-mode scale (viewport does the heavy lifting). */
function focusScaleFromFontSize(fontSize: number): number {
  const t = (fontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)
  return 0.75 + Math.min(1, Math.max(0, t)) * 0.55
}

function FocusWordView({
  words,
  cursor,
  alignState,
  fontSize,
  mirror,
  mode,
  onSeek,
  containerRef,
  registerWordRef,
}: {
  words: readonly ScriptWord[]
  cursor: number
  alignState: AlignmentState
  fontSize: number
  mirror: boolean
  mode: 'one_word' | 'two_word'
  onSeek?: (index: number) => void
  containerRef: RefObject<HTMLDivElement | null>
  registerWordRef: (index: number, el: HTMLSpanElement | null) => void
}) {
  const last = Math.max(0, words.length - 1)
  const nextIndex = words.length === 0 ? -1 : Math.min(Math.max(0, cursor), last)
  const pastIndex = nextIndex > 0 ? nextIndex - 1 : -1
  const nextWord = nextIndex >= 0 ? words[nextIndex] : null
  const pastWord = pastIndex >= 0 ? words[pastIndex] : null
  const finished = words.length > 0 && cursor > last
  const scale = focusScaleFromFontSize(fontSize)

  const style = {
    ['--focus-scale' as string]: String(scale),
  } as CSSProperties

  return (
    <div
      ref={containerRef}
      className="script-view script-focus"
      data-focus-mode={mode}
      data-mirrored={mirror ? 'true' : undefined}
      data-off-script={alignState === 'off_script' ? 'true' : undefined}
      style={style}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="script-mirror script-focus-inner">
        {mode === 'two_word' ? (
          <div className="script-focus-stack">
            <span className="script-focus-label" aria-hidden>
              Said
            </span>
            {pastWord ? (
              <span
                ref={(el) => registerWordRef(pastWord.index, el)}
                className="script-focus-word is-past is-seekable"
                data-index={pastWord.index}
                onClick={
                  onSeek
                    ? (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onSeek(pastWord.index)
                      }
                    : undefined
                }
              >
                {pastWord.raw}
              </span>
            ) : (
              <span className="script-focus-word is-past is-empty">—</span>
            )}
            <span className="script-focus-label" aria-hidden>
              Next
            </span>
            {finished ? (
              <span className="script-focus-word is-current is-done">Done</span>
            ) : nextWord ? (
              <span
                ref={(el) => registerWordRef(nextWord.index, el)}
                className={`script-focus-word is-current${alignState === 'off_script' ? ' is-frozen' : ''}${onSeek ? ' is-seekable' : ''}`}
                data-index={nextWord.index}
                onClick={
                  onSeek
                    ? (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onSeek(nextWord.index)
                      }
                    : undefined
                }
              >
                {nextWord.raw}
              </span>
            ) : (
              <span className="script-focus-word is-current is-empty">…</span>
            )}
          </div>
        ) : finished ? (
          <span className="script-focus-word is-current is-done">Done</span>
        ) : nextWord ? (
          <span
            ref={(el) => registerWordRef(nextWord.index, el)}
            className={`script-focus-word is-current${alignState === 'off_script' ? ' is-frozen' : ''}${onSeek ? ' is-seekable' : ''}`}
            data-index={nextWord.index}
            onClick={
              onSeek
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSeek(nextWord.index)
                  }
                : undefined
            }
          >
            {nextWord.raw}
          </span>
        ) : (
          <span className="script-focus-word is-current is-empty">…</span>
        )}
      </div>
    </div>
  )
}

export function ScriptView({
  script,
  words,
  cursor,
  alignState,
  fontSize,
  lineWidth,
  mirror,
  preserveBreaks,
  sentenceBreak,
  displayMode,
  showCursorHighlight,
  scrollAnchor,
  onSeek,
  containerRef,
  registerWordRef,
}: ScriptViewProps) {
  if (displayMode === 'one_word' || displayMode === 'two_word') {
    return (
      <FocusWordView
        words={words}
        cursor={cursor}
        alignState={alignState}
        fontSize={fontSize}
        mirror={mirror}
        mode={displayMode}
        onSeek={onSeek}
        containerRef={containerRef}
        registerWordRef={registerWordRef}
      />
    )
  }

  const scriptScale =
    fontSize >= 96 ? 'xxl' : fontSize >= 72 ? 'xl' : fontSize >= 48 ? 'lg' : 'md'
  const lineHeight =
    fontSize >= 96 ? 1.28 : fontSize >= 72 ? 1.34 : fontSize >= 48 ? 1.45 : 1.6

  return (
    <div
      ref={containerRef}
      className="script-view"
      data-scroll-anchor={scrollAnchor}
      data-mirrored={mirror ? 'true' : undefined}
      data-script-scale={scriptScale}
      style={{
        fontSize: `${fontSize}px`,
        maxWidth: `${lineWidth}ch`,
        lineHeight,
      }}
      aria-live="off"
    >
      <div className="script-mirror">
        <div className="script-pad script-pad-top" />
        <div className="script-text">
          {words.map((word, i) => {
            const isPast = showCursorHighlight && word.index < cursor
            const isCurrent = showCursorHighlight && word.index === cursor
            const className = [
              'script-word',
              isPast ? 'is-past' : '',
              isCurrent ? 'is-current' : '',
              isCurrent && alignState === 'off_script' ? 'is-frozen' : '',
              onSeek ? 'is-seekable' : '',
            ]
              .filter(Boolean)
              .join(' ')

            const br = breakAfterWord(
              script,
              word,
              words[i + 1],
              preserveBreaks,
              sentenceBreak,
            )

            return (
              <span key={word.index} className="script-token">
                <span
                  ref={(el) => registerWordRef(word.index, el)}
                  className={className}
                  data-index={word.index}
                  onClick={
                    onSeek
                      ? (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onSeek(word.index)
                        }
                      : undefined
                  }
                  title={onSeek ? 'Click to jump here' : undefined}
                >
                  {word.raw}
                </span>
                {br === 'paragraph' ? (
                  <>
                    <br />
                    <br />
                  </>
                ) : br === 'line' ? (
                  <br />
                ) : br === 'tab' ? (
                  <span className="sentence-tab" aria-hidden>
                    {'\u00A0\u00A0\u00A0\u00A0'}
                  </span>
                ) : (
                  ' '
                )}
              </span>
            )
          })}
        </div>
        <div className="script-pad script-pad-bottom" />
      </div>
    </div>
  )
}
