import { describe, expect, it } from 'vitest'
import { tokenizeScript } from './tokenize'
import { formatScriptTokens } from './formatScriptTokens'

describe('formatScriptTokens', () => {
  const SCRIPT = 'First sentence. Second sentence. Third sentence.'

  it('keeps full stops and inserts line breaks when sentenceBreak is "line"', () => {
    const words = tokenizeScript(SCRIPT)
    const { tokens } = formatScriptTokens(SCRIPT, words, true, 'line')

    // First sentence: "First" (space), "sentence." (line break)
    expect(tokens[0]?.word.raw).toBe('First')
    expect(tokens[0]?.trailing).toBe('')
    expect(tokens[0]?.br).toBe('space')

    expect(tokens[1]?.word.raw).toBe('sentence')
    expect(tokens[1]?.trailing).toBe('.')
    expect(tokens[1]?.hasFullStop).toBe(true)
    expect(tokens[1]?.br).toBe('line')

    // Second sentence: "Second" (space), "sentence." (line break)
    expect(tokens[2]?.word.raw).toBe('Second')
    expect(tokens[2]?.br).toBe('space')

    expect(tokens[3]?.word.raw).toBe('sentence')
    expect(tokens[3]?.trailing).toBe('.')
    expect(tokens[3]?.hasFullStop).toBe(true)
    expect(tokens[3]?.br).toBe('line')

    // Last sentence: "Third" (space), "sentence." (none)
    expect(tokens[4]?.word.raw).toBe('Third')
    expect(tokens[4]?.br).toBe('space')

    expect(tokens[5]?.word.raw).toBe('sentence')
    expect(tokens[5]?.trailing).toBe('.')
    expect(tokens[5]?.hasFullStop).toBe(true)
    expect(tokens[5]?.br).toBe('none')
  })

  it('keeps full stops and inserts tabs when sentenceBreak is "tab"', () => {
    const words = tokenizeScript(SCRIPT)
    const { tokens } = formatScriptTokens(SCRIPT, words, true, 'tab')

    expect(tokens[1]?.word.raw).toBe('sentence')
    expect(tokens[1]?.trailing).toBe('.')
    expect(tokens[1]?.br).toBe('tab')

    expect(tokens[3]?.word.raw).toBe('sentence')
    expect(tokens[3]?.trailing).toBe('.')
    expect(tokens[3]?.br).toBe('tab')

    expect(tokens[5]?.word.raw).toBe('sentence')
    expect(tokens[5]?.trailing).toBe('.')
    expect(tokens[5]?.br).toBe('none')
  })

  it('keeps full stops and uses spaces when sentenceBreak is "off"', () => {
    const words = tokenizeScript(SCRIPT)
    const { tokens } = formatScriptTokens(SCRIPT, words, true, 'off')

    expect(tokens[1]?.word.raw).toBe('sentence')
    expect(tokens[1]?.trailing).toBe('.')
    expect(tokens[1]?.br).toBe('space')
    expect(tokens[1]?.separator).toBe(' ')

    expect(tokens[3]?.word.raw).toBe('sentence')
    expect(tokens[3]?.trailing).toBe('.')
    expect(tokens[3]?.br).toBe('space')
    expect(tokens[3]?.separator).toBe(' ')

    expect(tokens[5]?.word.raw).toBe('sentence')
    expect(tokens[5]?.trailing).toBe('.')
    expect(tokens[5]?.br).toBe('none')
  })

  it('preserves paragraph breaks even when sentenceBreak is active', () => {
    const script = 'Paragraph one.\n\nParagraph two.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'line')

    expect(tokens[1]?.word.raw).toBe('one')
    expect(tokens[1]?.trailing).toBe('.')
    expect(tokens[1]?.br).toBe('paragraph')
  })

  it('handles sentenceBreak when preserveBreaks is off', () => {
    const script = 'Paragraph one.\n\nParagraph two.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, false, 'line')

    expect(tokens[1]?.word.raw).toBe('one')
    expect(tokens[1]?.trailing).toBe('.')
    expect(tokens[1]?.br).toBe('line')
  })

  it('correctly handles quotes and attached punctuation', () => {
    const script = 'He said, "Hello world." Then left.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'line')

    // "He"
    expect(tokens[0]?.word.raw).toBe('He')
    // "said,"
    expect(tokens[1]?.word.raw).toBe('said')
    expect(tokens[1]?.trailing).toBe(',')
    // "\"Hello"
    expect(tokens[2]?.leading).toBe('"')
    expect(tokens[2]?.word.raw).toBe('Hello')
    // "world.\""
    expect(tokens[3]?.word.raw).toBe('world')
    expect(tokens[3]?.trailing).toBe('."')
    expect(tokens[3]?.hasFullStop).toBe(true)
    expect(tokens[3]?.br).toBe('line')
  })

  it('does not treat leading period in file extensions like .txt as sentence full stop', () => {
    const script = 'Import a .txt file now.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'line')

    const aToken = tokens.find((t) => t.word.raw === 'a')
    expect(aToken?.trailing).toBe('')
    expect(aToken?.hasFullStop).toBe(false)
    expect(aToken?.br).toBe('space')

    const txtToken = tokens.find((t) => t.word.raw === 'txt')
    expect(txtToken?.leading).toBe('.')
    expect(txtToken?.trailing).toBe('')
    expect(txtToken?.hasFullStop).toBe(false)

    const nowToken = tokens.find((t) => t.word.raw === 'now')
    expect(nowToken?.trailing).toBe('.')
    expect(nowToken?.hasFullStop).toBe(true)
  })

  it('handles hyphenated words without adding spaces', () => {
    const script = 'Use on-device processing.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'line')

    const onToken = tokens.find((t) => t.word.raw === 'on')
    expect(onToken?.trailing).toBe('-')
    expect(onToken?.br).toBe('space')
    expect(onToken?.separator).toBe(null)
  })

  it('guarantees that 100% of punctuation from the original script is preserved across all modes', () => {
    const extractPunct = (str: string) => str.replace(/[A-Za-z0-9\s]/g, '')

    const testScripts = [
      '*** START ***\n\nHello, world! (This is a test: $10.50 / 20% off -- "great deal!")\n\nSection 1.\n\n***\n\nSection 2... Done? Yes! End.',
      'Welcome to the on-device voice-follow teleprompter.\n\nSpeak naturally — pace matters. Try .txt files.',
      '1. First. 2. Second. 3. Third.',
      'A & B Corp. @ 10:00 #trending ^2 ~approx',
      'No words at all: !!! ??? ***',
      'Just one word.',
      '!!! ??? *** --- ...',
    ]

    for (const script of testScripts) {
      const origPunct = extractPunct(script)
      const words = tokenizeScript(script)

      for (const mode of ['off', 'line', 'tab'] as const) {
        for (const preserve of [true, false]) {
          const res = formatScriptTokens(script, words, preserve, mode)

          let rendered = res.prefix
          for (const t of res.tokens) {
            rendered += t.leading + t.word.raw + t.trailing
            if (t.separator) rendered += t.separator
          }
          rendered += res.suffix

          const rendPunct = extractPunct(rendered)
          expect(rendPunct).toBe(origPunct)
        }
      }
    }
  })

  it('cycles sentence colors white -> blue -> yellow -> white across consecutive sentences', () => {
    const script =
      'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'off')

    // Sentence 0: "First sentence." -> white
    expect(tokens[0]?.word.raw).toBe('First')
    expect(tokens[0]?.sentenceIndex).toBe(0)
    expect(tokens[0]?.sentenceColor).toBe('white')

    expect(tokens[1]?.word.raw).toBe('sentence')
    expect(tokens[1]?.sentenceIndex).toBe(0)
    expect(tokens[1]?.sentenceColor).toBe('white')

    // Sentence 1: "Second sentence." -> blue
    expect(tokens[2]?.word.raw).toBe('Second')
    expect(tokens[2]?.sentenceIndex).toBe(1)
    expect(tokens[2]?.sentenceColor).toBe('blue')

    expect(tokens[3]?.word.raw).toBe('sentence')
    expect(tokens[3]?.sentenceIndex).toBe(1)
    expect(tokens[3]?.sentenceColor).toBe('blue')

    // Sentence 2: "Third sentence." -> yellow
    expect(tokens[4]?.word.raw).toBe('Third')
    expect(tokens[4]?.sentenceIndex).toBe(2)
    expect(tokens[4]?.sentenceColor).toBe('yellow')

    expect(tokens[5]?.word.raw).toBe('sentence')
    expect(tokens[5]?.sentenceIndex).toBe(2)
    expect(tokens[5]?.sentenceColor).toBe('yellow')

    // Sentence 3: "Fourth sentence." -> white
    expect(tokens[6]?.word.raw).toBe('Fourth')
    expect(tokens[6]?.sentenceIndex).toBe(3)
    expect(tokens[6]?.sentenceColor).toBe('white')

    expect(tokens[7]?.word.raw).toBe('sentence')
    expect(tokens[7]?.sentenceIndex).toBe(3)
    expect(tokens[7]?.sentenceColor).toBe('white')

    // Sentence 4: "Fifth sentence." -> blue
    expect(tokens[8]?.word.raw).toBe('Fifth')
    expect(tokens[8]?.sentenceIndex).toBe(4)
    expect(tokens[8]?.sentenceColor).toBe('blue')

    expect(tokens[9]?.word.raw).toBe('sentence')
    expect(tokens[9]?.sentenceIndex).toBe(4)
    expect(tokens[9]?.sentenceColor).toBe('blue')
  })

  it('handles question marks, exclamation marks, and ellipses as sentence boundaries', () => {
    const script = 'Are you ready? Yes, absolutely! Wait for it… Now go.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'off')

    // "Are you ready?" -> white
    const readyToken = tokens.find((t) => t.word.raw === 'ready')
    expect(readyToken?.sentenceIndex).toBe(0)
    expect(readyToken?.sentenceColor).toBe('white')

    // "Yes, absolutely!" -> blue
    const absToken = tokens.find((t) => t.word.raw === 'absolutely')
    expect(absToken?.sentenceIndex).toBe(1)
    expect(absToken?.sentenceColor).toBe('blue')

    // "Wait for it…" -> yellow
    const waitToken = tokens.find((t) => t.word.raw === 'Wait')
    expect(waitToken?.sentenceIndex).toBe(2)
    expect(waitToken?.sentenceColor).toBe('yellow')

    // "Now go." -> white
    const nowToken = tokens.find((t) => t.word.raw === 'Now')
    expect(nowToken?.sentenceIndex).toBe(3)
    expect(nowToken?.sentenceColor).toBe('white')
  })

  it('handles paragraph breaks without punctuation as sentence boundaries', () => {
    const script = 'Title Line\n\nBody paragraph text.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'off')

    const titleToken = tokens.find((t) => t.word.raw === 'Title')
    expect(titleToken?.sentenceIndex).toBe(0)
    expect(titleToken?.sentenceColor).toBe('white')

    const bodyToken = tokens.find((t) => t.word.raw === 'Body')
    expect(bodyToken?.sentenceIndex).toBe(1)
    expect(bodyToken?.sentenceColor).toBe('blue')
  })

  it('treats spaced hyphens (" - ") as full stops and cycles sentence colors by default', () => {
    const script = 'First thought - second thought - third thought.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'off')

    // First thought: sentenceIndex 0 (white)
    const firstToken = tokens.find((t) => t.word.raw === 'First')
    const thoughtToken1 = tokens[1]
    expect(firstToken?.sentenceIndex).toBe(0)
    expect(firstToken?.sentenceColor).toBe('white')
    expect(thoughtToken1?.sentenceIndex).toBe(0)
    expect(thoughtToken1?.sentenceColor).toBe('white')
    expect(thoughtToken1?.hasFullStop).toBe(true)
    expect(thoughtToken1?.hasDash).toBe(true)

    // second thought: sentenceIndex 1 (blue)
    const secondToken = tokens.find((t) => t.word.raw === 'second')
    const thoughtToken2 = tokens[3]
    expect(secondToken?.sentenceIndex).toBe(1)
    expect(secondToken?.sentenceColor).toBe('blue')
    expect(thoughtToken2?.sentenceIndex).toBe(1)
    expect(thoughtToken2?.sentenceColor).toBe('blue')
    expect(thoughtToken2?.hasFullStop).toBe(true)
    expect(thoughtToken2?.hasDash).toBe(true)

    // third thought: sentenceIndex 2 (yellow)
    const thirdToken = tokens.find((t) => t.word.raw === 'third')
    const thoughtToken3 = tokens[5]
    expect(thirdToken?.sentenceIndex).toBe(2)
    expect(thirdToken?.sentenceColor).toBe('yellow')
    expect(thoughtToken3?.sentenceIndex).toBe(2)
    expect(thoughtToken3?.sentenceColor).toBe('yellow')
  })

  it('breaks on dashes when sentenceBreak is "line" and dashAsFullStop is enabled', () => {
    const script = 'Intro clause - middle clause — final clause.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'line', true)

    const clause1 = tokens.find((t) => t.word.raw === 'clause' && t.word.index === 1)
    expect(clause1?.br).toBe('line')
    expect(clause1?.hasFullStop).toBe(true)

    const clause2 = tokens.find((t) => t.word.raw === 'clause' && t.word.index === 3)
    expect(clause2?.br).toBe('line')
    expect(clause2?.hasFullStop).toBe(true)
  })

  it('treats em-dashes (— and –) and double-hyphens (--) as full stops', () => {
    const script = 'Pace matters — breathe deeply -- stay relaxed – you got this.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'off', true)

    // "Pace matters" -> white (sentence 0)
    expect(tokens[0]?.sentenceColor).toBe('white')
    expect(tokens[1]?.sentenceColor).toBe('white')
    expect(tokens[1]?.hasFullStop).toBe(true)

    // "breathe deeply" -> blue (sentence 1)
    expect(tokens[2]?.sentenceColor).toBe('blue')
    expect(tokens[3]?.sentenceColor).toBe('blue')
    expect(tokens[3]?.hasFullStop).toBe(true)

    // "stay relaxed" -> yellow (sentence 2)
    expect(tokens[4]?.sentenceColor).toBe('yellow')
    expect(tokens[5]?.sentenceColor).toBe('yellow')
    expect(tokens[5]?.hasFullStop).toBe(true)

    // "you got this." -> white (sentence 3)
    expect(tokens[6]?.sentenceColor).toBe('white')
    expect(tokens[7]?.sentenceColor).toBe('white')
    expect(tokens[8]?.sentenceColor).toBe('white')
  })

  it('does NOT treat hyphenated compound words (on-device, state-of-the-art) as full stops or sentence breaks', () => {
    const script = 'Use on-device words-per-minute and state-of-the-art tools.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'line', true)

    // Every token before the period at the end should remain in sentenceIndex 0
    for (const token of tokens) {
      expect(token.sentenceIndex).toBe(0)
      expect(token.sentenceColor).toBe('white')
    }

    const onToken = tokens.find((t) => t.word.raw === 'on')
    expect(onToken?.hasFullStop).toBe(false)
    expect(onToken?.br).toBe('space')

    const wordsToken = tokens.find((t) => t.word.raw === 'words')
    expect(wordsToken?.hasFullStop).toBe(false)
    expect(wordsToken?.br).toBe('space')
  })

  it('does not treat dashes as full stops when dashAsFullStop is disabled', () => {
    const script = 'First thought - second thought — third thought.'
    const words = tokenizeScript(script)
    const { tokens } = formatScriptTokens(script, words, true, 'line', false)

    // All should be in sentence 0 (white) because dashes are ignored as sentence ends
    for (let i = 0; i < tokens.length - 1; i++) {
      expect(tokens[i]?.sentenceIndex).toBe(0)
      expect(tokens[i]?.sentenceColor).toBe('white')
      expect(tokens[i]?.hasFullStop).toBe(false)
      expect(tokens[i]?.br).toBe('space')
    }

    // Only the final full stop at "thought." has full stop
    const lastToken = tokens[tokens.length - 1]
    expect(lastToken?.hasFullStop).toBe(true)
  })
})
