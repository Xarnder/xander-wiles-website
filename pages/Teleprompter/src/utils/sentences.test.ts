import { describe, expect, it } from 'vitest'
import { tokenizeScript } from './tokenize'
import {
  isSentenceEnd,
  findSentenceStartIndex,
  findSentenceEndIndex,
  nextSentenceBoundary,
} from './sentences'

describe('sentences utils', () => {
  it('identifies standard sentence endings', () => {
    const script = 'Hello world. Next sentence! Are you sure? Yes… done.'
    const words = tokenizeScript(script)

    // "world." is sentence end
    expect(isSentenceEnd(script, words, 1)).toBe(true)
    // "sentence!" is sentence end
    expect(isSentenceEnd(script, words, 3)).toBe(true)
    // "sure?" is sentence end
    expect(isSentenceEnd(script, words, 6)).toBe(true)
    // "Yes…" is sentence end
    expect(isSentenceEnd(script, words, 7)).toBe(true)
    // "done." is sentence end (last word)
    expect(isSentenceEnd(script, words, 8)).toBe(true)
    // "Hello" is not sentence end
    expect(isSentenceEnd(script, words, 0)).toBe(false)
  })

  it('identifies dashes as sentence ends when dashAsFullStop is enabled (default)', () => {
    const script = 'Pace matters — breathe deeply - stay relaxed -- finish strong.'
    const words = tokenizeScript(script)

    // "matters —" (word index 1)
    expect(isSentenceEnd(script, words, 1, true)).toBe(true)
    // "deeply - " (word index 3)
    expect(isSentenceEnd(script, words, 3, true)).toBe(true)
    // "relaxed -- " (word index 5)
    expect(isSentenceEnd(script, words, 5, true)).toBe(true)
  })

  it('does NOT identify hyphens in compound words as sentence ends', () => {
    const script = 'Use on-device words-per-minute processing.'
    const words = tokenizeScript(script)

    // "on" -> gap is "-" before "device"
    expect(isSentenceEnd(script, words, 1, true)).toBe(false)
    // "words" -> gap is "-" before "per"
    expect(isSentenceEnd(script, words, 3, true)).toBe(false)
    // "per" -> gap is "-" before "minute"
    expect(isSentenceEnd(script, words, 4, true)).toBe(false)
  })

  it('ignores dashes when dashAsFullStop is false', () => {
    const script = 'Pace matters — breathe deeply - stay relaxed.'
    const words = tokenizeScript(script)

    expect(isSentenceEnd(script, words, 1, false)).toBe(false)
    expect(isSentenceEnd(script, words, 3, false)).toBe(false)
    // Last word is always end
    expect(isSentenceEnd(script, words, 5, false)).toBe(true)
  })

  it('finds sentence start and end with dashes as boundaries', () => {
    const script = 'First clause here — second clause now.'
    const words = tokenizeScript(script)

    // cursor at 0 ("First"): start 0, end 2 ("here")
    expect(findSentenceStartIndex(script, words, 0, true)).toBe(0)
    expect(findSentenceEndIndex(script, words, 0, true)).toBe(2)

    // cursor at 3 ("second"): start 3, end 5 ("now")
    expect(findSentenceStartIndex(script, words, 3, true)).toBe(3)
    expect(findSentenceEndIndex(script, words, 3, true)).toBe(5)
  })

  it('navigates sentence boundaries across dashes', () => {
    const script = 'Intro clause — middle clause — final clause.'
    const words = tokenizeScript(script)

    // down from index 0: moves to end of first sentence (index 1 "clause")
    const step1 = nextSentenceBoundary(script, words, 0, 'down', true)
    expect(step1).toBe(1)

    // down from index 1: moves to start of second sentence (index 2 "middle")
    const step2 = nextSentenceBoundary(script, words, step1, 'down', true)
    expect(step2).toBe(2)

    // down from index 2: moves to end of second sentence (index 3 "clause")
    const step3 = nextSentenceBoundary(script, words, step2, 'down', true)
    expect(step3).toBe(3)
  })
})
