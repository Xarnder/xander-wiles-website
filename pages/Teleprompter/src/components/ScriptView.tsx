import type { RefObject } from 'react'
import type { ScriptWord } from '../utils/tokenize'
import type { AlignmentState } from '../alignment/AlignmentEngine'

interface ScriptViewProps {
  words: readonly ScriptWord[]
  cursor: number
  alignState: AlignmentState
  fontSize: number
  lineWidth: number
  mirror: boolean
  containerRef: RefObject<HTMLDivElement | null>
  registerWordRef: (index: number, el: HTMLSpanElement | null) => void
}

export function ScriptView({
  words,
  cursor,
  alignState,
  fontSize,
  lineWidth,
  mirror,
  containerRef,
  registerWordRef,
}: ScriptViewProps) {
  return (
    <div
      ref={containerRef}
      className={`script-view ${mirror ? 'is-mirrored' : ''}`}
      style={{
        fontSize: `${fontSize}px`,
        maxWidth: `${lineWidth}ch`,
      }}
      aria-live="off"
    >
      <div className="script-pad" />
      <p className="script-text">
        {words.map((word) => {
          const isPast = word.index < cursor
          const isCurrent = word.index === cursor
          const className = [
            'script-word',
            isPast ? 'is-past' : '',
            isCurrent ? 'is-current' : '',
            isCurrent && alignState === 'off_script' ? 'is-frozen' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <span key={word.index}>
              <span
                ref={(el) => registerWordRef(word.index, el)}
                className={className}
                data-index={word.index}
              >
                {word.raw}
              </span>{' '}
            </span>
          )
        })}
      </p>
      <div className="script-pad" />
    </div>
  )
}
