import { describe, expect, it } from 'vitest'
import { parseBullets } from './parseBullets'

describe('parseBullets', () => {
  it('parses one plain-text point per line and skips blanks', () => {
    const bullets = parseBullets(
      'Introduction to our company\n\nThe problem we are solving\n\n',
    )
    expect(bullets).toEqual([
      'Introduction to our company',
      'The problem we are solving',
    ])
  })

  it('strips markdown bullets and keeps the content', () => {
    const bullets = parseBullets(
      [
        '- Introduction to our company',
        '* The problem we are solving',
        '+ Our proposed solution',
        '• Market opportunity',
      ].join('\n'),
    )
    expect(bullets).toEqual([
      'Introduction to our company',
      'The problem we are solving',
      'Our proposed solution',
      'Market opportunity',
    ])
  })

  it('strips numbered and lettered lists', () => {
    const bullets = parseBullets('1. First point\n2) Second point\nA. Third point')
    expect(bullets).toEqual(['First point', 'Second point', 'Third point'])
  })

  it('does not treat a dotted number inside the line as a marker', () => {
    expect(parseBullets('1.2 million customers')).toEqual(['1.2 million customers'])
  })

  it('joins an indented continuation onto the previous bullet', () => {
    const bullets = parseBullets(
      '- Introduction to our company\n  and the team behind it\n- Conclusion',
    )
    expect(bullets).toEqual([
      'Introduction to our company and the team behind it',
      'Conclusion',
    ])
  })

  it('ignores marker-only and whitespace lines', () => {
    expect(parseBullets('-\n\n*\n  \nReal point\n')).toEqual(['Real point'])
  })

  it('returns no steps for an empty script', () => {
    expect(parseBullets('')).toEqual([])
    expect(parseBullets('\n\n')).toEqual([])
  })

  it('accepts dash, star, dot, and bullet glyphs with or without a space', () => {
    const bullets = parseBullets(
      [
        '-Flush dash',
        '- Spaced dash',
        '*Flush star',
        '* Spaced star',
        '.Flush dot',
        '. Spaced dot',
        '•Flush bullet',
        '· Middle dot',
        '●Circle',
        '–En dash',
        '—Em dash',
        '>Quote',
      ].join('\n'),
    )
    expect(bullets).toEqual([
      'Flush dash',
      'Spaced dash',
      'Flush star',
      'Spaced star',
      'Flush dot',
      'Spaced dot',
      'Flush bullet',
      'Middle dot',
      'Circle',
      'En dash',
      'Em dash',
      'Quote',
    ])
  })

  it('accepts numbers and letters flush against the marker', () => {
    expect(
      parseBullets(
        '1.First\n2)Second\n3:Third\n10. Tenth\n(4) Fourth\n(b) Letter\niv. Roman\nA)No space',
      ),
    ).toEqual([
      'First',
      'Second',
      'Third',
      'Tenth',
      'Fourth',
      'Letter',
      'Roman',
      'No space',
    ])
  })

  it('keeps decimals, times, abbreviations, and negative numbers', () => {
    expect(
      parseBullets('1.2 million customers\n12:30 start\ni.e. for example\ne.g. this one\n-3 degrees\nNo. 1 choice'),
    ).toEqual([
      '1.2 million customers',
      '12:30 start',
      'i.e. for example',
      'e.g. this one',
      '-3 degrees',
      'No. 1 choice',
    ])
  })

  it('strips checklist markers and ignores marker-only lines', () => {
    expect(
      parseBullets('- [ ] Buy milk\n* [x] Send notes\n-\n1.\n.\n•\n---\n[ ] Plain box'),
    ).toEqual(['Buy milk', 'Send notes', 'Plain box'])
  })

  it('mixes plain lines with any marker style', () => {
    expect(
      parseBullets('Introduction\n-The problem\n2.Our solution\n.Market\n*Model\nConclusion'),
    ).toEqual(['Introduction', 'The problem', 'Our solution', 'Market', 'Model', 'Conclusion'])
  })
})
