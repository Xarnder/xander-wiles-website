import { describe, expect, it } from 'vitest'
import { TriggerDetector, type TranscriptEvent } from './TriggerDetector'

function feed(detector: TriggerDetector, events: TranscriptEvent[]): number[] {
  return events.map((event) => detector.consume(event))
}

describe('TriggerDetector', () => {
  it('advances once for a single spoken trigger inside a sentence', () => {
    const detector = new TriggerDetector('next')
    expect(
      detector.consume({
        kind: 'final',
        text: 'and the next section covers pricing',
        coverage: 'segment',
      }),
    ).toBe(1)
  })

  it('recognises a multiword phrase and ignores the words when they are split', () => {
    const detector = new TriggerDetector('moving on')
    expect(
      detector.consume({ kind: 'final', text: 'we are moving quickly on' }),
    ).toBe(0)
    expect(
      detector.consume({ kind: 'final', text: 'Moving, on! to the demo' }),
    ).toBe(1)
  })

  it('matches case-insensitively and ignores punctuation and extra whitespace', () => {
    const detector = new TriggerDetector('  Next  ')
    expect(detector.consume({ kind: 'final', text: 'NEXT!' })).toBe(1)
    expect(detector.consume({ kind: 'final', text: 'ok,   next.' })).toBe(1)
  })

  it('does not match the trigger as a substring of a longer word', () => {
    const detector = new TriggerDetector('next')
    expect(detector.consume({ kind: 'final', text: 'the nextdoor neighbor' })).toBe(0)
    expect(detector.consume({ kind: 'final', text: 'go next' })).toBe(1)
  })

  it('does not advance twice when an interim result is repeated as a final', () => {
    const detector = new TriggerDetector('next')
    expect(
      feed(detector, [
        { kind: 'interim', text: 'please say next now', coverage: 'segment' },
        { kind: 'interim', text: 'please say next now', coverage: 'segment' },
        { kind: 'final', text: 'please say next now', coverage: 'segment' },
      ]),
    ).toEqual([0, 1, 0])
  })

  it('confirms a high-confidence interim immediately and still ignores its final', () => {
    const detector = new TriggerDetector('next')
    expect(
      detector.consume({
        kind: 'interim',
        text: 'next',
        confidence: 0.9,
        coverage: 'segment',
      }),
    ).toBe(1)
    expect(
      detector.consume({
        kind: 'final',
        text: 'next',
        confidence: 0.9,
        coverage: 'segment',
      }),
    ).toBe(0)
  })

  it('ignores low-confidence results until a confident one arrives', () => {
    const detector = new TriggerDetector('next')
    expect(
      feed(detector, [
        { kind: 'interim', text: 'next', confidence: 0.2 },
        { kind: 'final', text: 'next', confidence: 0.3 },
        { kind: 'final', text: 'next', confidence: 0.8 },
      ]),
    ).toEqual([0, 0, 1])
  })

  it('counts a second interim occurrence of the trigger only once it is stable', () => {
    const detector = new TriggerDetector('next')
    expect(
      feed(detector, [
        { kind: 'interim', text: 'say next', coverage: 'segment' },
        { kind: 'interim', text: 'say next', coverage: 'segment' },
        { kind: 'interim', text: 'say next and next', coverage: 'segment' },
        { kind: 'interim', text: 'say next and next', coverage: 'segment' },
      ]),
    ).toEqual([0, 1, 0, 1])
  })

  it('counts separate utterances of the same trigger as separate occurrences', () => {
    const detector = new TriggerDetector('next')
    expect(
      feed(detector, [
        { kind: 'final', text: 'next', coverage: 'segment' },
        { kind: 'final', text: 'next', coverage: 'segment' },
        { kind: 'final', text: 'and then next', coverage: 'segment' },
      ]),
    ).toEqual([1, 1, 1])
  })

  it('counts two triggers in one final utterance', () => {
    const detector = new TriggerDetector('next')
    expect(
      detector.consume({ kind: 'final', text: 'next. next.', coverage: 'segment' }),
    ).toBe(2)
  })

  it('merges cumulative transcripts so already-heard words do not fire again', () => {
    const detector = new TriggerDetector('next')
    expect(
      feed(detector, [
        { kind: 'interim', text: 'hello', coverage: 'cumulative' },
        { kind: 'interim', text: 'hello next', coverage: 'cumulative' },
        { kind: 'interim', text: 'hello next', coverage: 'cumulative' },
        { kind: 'interim', text: 'hello next everyone', coverage: 'cumulative' },
        { kind: 'final', text: 'hello next everyone', coverage: 'cumulative' },
      ]),
    ).toEqual([0, 0, 1, 0, 0])
  })

  it('counts only the new trigger in an overlapping cumulative window', () => {
    const detector = new TriggerDetector('next')
    expect(
      detector.consume({
        kind: 'final',
        text: 'we say next please',
        coverage: 'cumulative',
      }),
    ).toBe(1)
    expect(
      detector.consume({
        kind: 'final',
        text: 'say next please and then next',
        coverage: 'cumulative',
      }),
    ).toBe(1)
  })

  it('does not emit while paused, and does not replay that transcript after resume', () => {
    const detector = new TriggerDetector('next')
    detector.consume({ kind: 'final', text: 'intro is done', coverage: 'segment' })
    detector.pause()
    expect(
      detector.consume({ kind: 'final', text: 'next', coverage: 'segment' }),
    ).toBe(0)
    detector.resume()
    expect(
      detector.consume({ kind: 'final', text: 'next', coverage: 'segment' }),
    ).toBe(0)
    expect(
      detector.consume({ kind: 'final', text: 'moving next', coverage: 'segment' }),
    ).toBe(1)
  })

  it('accepts a new phrase immediately after a fresh reset', () => {
    const detector = new TriggerDetector('next')
    detector.consume({ kind: 'final', text: 'next' })
    detector.reset()
    expect(detector.consume({ kind: 'final', text: 'next' })).toBe(1)
  })

  it('steps forward and back on separate phrases without matching the shared word', () => {
    const detector = new TriggerDetector('next slide')
    detector.setBack('backwards slide')
    expect(
      detector.consumeDirections({
        kind: 'final',
        text: 'please go to the next slide now',
        coverage: 'segment',
      }),
    ).toEqual(['forward'])
    expect(
      detector.consumeDirections({
        kind: 'final',
        text: 'backwards slide',
        coverage: 'segment',
      }),
    ).toEqual(['back'])
    expect(
      detector.consumeDirections({
        kind: 'final',
        text: 'next',
        coverage: 'segment',
      }),
    ).toEqual([])
  })

  it('applies both directions in one sentence and does not double-count an interim', () => {
    const detector = new TriggerDetector('next slide')
    detector.setBack('backwards slide')
    expect(
      feed(detector, [
        {
          kind: 'interim',
          text: 'backwards slide then next slide',
          coverage: 'segment',
        },
        {
          kind: 'interim',
          text: 'backwards slide then next slide',
          coverage: 'segment',
        },
        {
          kind: 'final',
          text: 'backwards slide then next slide',
          coverage: 'segment',
        },
      ]),
    ).toEqual([0, 2, 0])
    expect(
      detector.consumeDirections({
        kind: 'final',
        text: 'say backwards slide',
        coverage: 'segment',
      }),
    ).toEqual(['back'])
  })

  it('lets the longer phrase win when the two triggers overlap', () => {
    const detector = new TriggerDetector('slide')
    detector.setBack('backwards slide')
    expect(
      detector.consumeDirections({
        kind: 'final',
        text: 'backwards slide',
        coverage: 'segment',
      }),
    ).toEqual(['back'])
    expect(
      detector.consumeDirections({
        kind: 'final',
        text: 'just slide',
        coverage: 'segment',
      }),
    ).toEqual(['forward'])
  })
})
