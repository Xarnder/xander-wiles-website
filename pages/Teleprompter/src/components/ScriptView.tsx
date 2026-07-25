import type { RefObject } from 'react'
import type { ScriptWord } from '../utils/tokenize'
import type { AlignmentState } from '../alignment/AlignmentEngine'
import type { SentenceBreakMode, ScrollAnchorMode } from '../hooks/useTeleprompter'

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
  showCursorHighlight,
  scrollAnchor,
  onSeek,
  containerRef,
  registerWordRef,
}: ScriptViewProps) {
  return (
    <div
      ref={containerRef}
      className="script-view"
      data-scroll-anchor={scrollAnchor}
      data-mirrored={mirror ? 'true' : undefined}
      style={{
        fontSize: `${fontSize}px`,
        maxWidth: `${lineWidth}ch`,
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
