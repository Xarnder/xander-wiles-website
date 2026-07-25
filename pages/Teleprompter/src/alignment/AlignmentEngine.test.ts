import { describe, expect, it } from 'vitest'
import { AlignmentEngine, replayAlignment } from './AlignmentEngine'
import { wordSimilarity, scoreAlignment } from './scoring'
import { normalizeText } from '../utils/normalize'
import { tokenizeScript, tokenizeTranscript } from '../utils/tokenize'

describe('normalizeText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeText('Hello, World!')).toBe('hello world')
  })

  it('maps simple number words', () => {
    expect(normalizeText('twenty six')).toBe('26')
  })

  it('maps year-like spoken forms best-effort', () => {
    expect(normalizeText('twenty twenty six')).toBe('2026')
  })
})

describe('tokenize', () => {
  it('assigns stable indices and offsets', () => {
    const words = tokenizeScript('Hello, brave world.')
    expect(words.map((w) => w.normalized)).toEqual(['hello', 'brave', 'world'])
    expect(words[0]?.raw).toBe('Hello')
    expect(words[1]?.index).toBe(1)
  })

  it('tokenizes transcripts', () => {
    expect(tokenizeTranscript('Hello — brave world!')).toEqual([
      'hello',
      'brave',
      'world',
    ])
  })
})

describe('scoring', () => {
  it('scores exact alignments highly', () => {
    const script = ['the', 'quick', 'brown', 'fox']
    expect(scoreAlignment(script, 1, ['quick', 'brown'])).toBe(1)
  })

  it('tolerates small typos', () => {
    expect(wordSimilarity('teleprompter', 'telepromtr')).toBeGreaterThan(0.7)
  })
})

const SAMPLE = `
Welcome to the voice follow teleprompter.
Speak naturally and the text will scroll with you.
If you go off script for a while, scrolling will pause.
When you return to these words, it will resume smoothly.
Skipping ahead to a later paragraph should also re-sync.
`.trim()

describe('AlignmentEngine', () => {
  it('advances the cursor while reading straight through', () => {
    const engine = new AlignmentEngine(SAMPLE)
    const words = engine.getScriptWords().map((w) => w.normalized)

    // Feed growing partials for the first sentence
    const first = words.slice(0, 8)
    let result = engine.processSpokenWords([])
    for (let i = 2; i <= first.length; i++) {
      result = engine.processSpokenWords(first.slice(0, i))
    }

    expect(result.state).toBe('tracking')
    expect(result.cursor).toBeGreaterThanOrEqual(5)
  })

  it('freezes on off-script speech then resumes', () => {
    const engine = new AlignmentEngine(SAMPLE)
    const script = engine.getScriptWords().map((w) => w.normalized)

    // Establish position near start
    engine.processSpokenWords(script.slice(0, 6))
    const at = engine.getSnapshot().cursor

    // Ad-lib nonsense
    const off = engine.processSpokenWords([
      'banana',
      'spaceship',
      'purple',
      'elephant',
      'jazz',
      'saxophone',
    ])
    expect(off.state).toBe('off_script')
    expect(off.cursor).toBe(at)

    // Return to the next words in the script
    const resumeWords = script.slice(at, at + 8)
    const resumed = engine.processSpokenWords(resumeWords)
    expect(resumed.state).toBe('tracking')
    expect(resumed.cursor).toBeGreaterThanOrEqual(at)
  })

  it('re-syncs when skipping ahead within the window', () => {
    const engine = new AlignmentEngine(SAMPLE)
    const script = engine.getScriptWords().map((w) => w.normalized)

    engine.processSpokenWords(script.slice(0, 5))
    const later = script.slice(20, 28)
    const result = engine.processSpokenWords(later)

    expect(result.state).toBe('tracking')
    expect(result.cursor).toBeGreaterThanOrEqual(20)
  })

  it('handles backtracking to repeat a line', () => {
    const engine = new AlignmentEngine(SAMPLE)
    const script = engine.getScriptWords().map((w) => w.normalized)

    engine.processSpokenWords(script.slice(0, 12))
    const ahead = engine.getSnapshot().cursor

    const back = engine.processSpokenWords(script.slice(0, 6))
    expect(back.state).toBe('tracking')
    // Should be allowed to move back within the soft backtrack window
    expect(back.cursor).toBeLessThanOrEqual(ahead)
  })

  it('rewinds to the earlier sentence when 5+ earlier words are spoken', () => {
    const engine = new AlignmentEngine(SAMPLE)
    const words = engine.getScriptWords()
    const script = words.map((w) => w.normalized)

    // Advance well into the second/third sentence
    engine.processSpokenWords(script.slice(0, 18))
    const ahead = engine.getSnapshot().cursor
    expect(ahead).toBeGreaterThan(10)

    // Re-speak five words from the first sentence
    const earlier = script.slice(0, 5)
    const result = engine.processSpokenWords(earlier)

    expect(result.state).toBe('tracking')
    expect(result.cursor).toBeLessThan(ahead)
    // Should land at the start of that sentence (script beginning here)
    expect(result.cursor).toBe(engine.findSentenceStartIndex(0))
  })

  it('replayAlignment returns a sequence of results', () => {
    const results = replayAlignment(SAMPLE, [
      'welcome to the voice',
      'welcome to the voice follow teleprompter',
      'speak naturally and the text',
    ])
    expect(results.length).toBe(3)
    expect(results[2]?.cursor).toBeGreaterThan(results[0]?.cursor ?? 0)
  })
})
