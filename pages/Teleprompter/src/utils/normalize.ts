/** Best-effort spoken ↔ written number forms for alignment. */
const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
}

const YEAR_PREFIXES = new Set(['nineteen', 'twenty'])

/**
 * Lowercase, strip punctuation, collapse whitespace, and lightly normalize
 * common number/year spoken forms so "twenty twenty six" can meet "2026".
 */
export function normalizeText(input: string): string {
  let text = input.toLowerCase()
  text = text.replace(/[’']/g, '')
  text = text.replace(/[^a-z0-9\s]/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return ''

  const tokens = text.split(' ')
  const out: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!

    // "twenty twenty six" / "twenty twenty-six" style years → 2026
    if (
      YEAR_PREFIXES.has(token) &&
      i + 2 < tokens.length &&
      YEAR_PREFIXES.has(tokens[i + 1]!) &&
      NUMBER_WORDS[tokens[i + 2]!]
    ) {
      const century = token === 'nineteen' ? '19' : '20'
      const decadeWord = tokens[i + 1]!
      const unitWord = tokens[i + 2]!
      // twenty + twenty + six → 2026 (decade "twenty" → 20, unit 6)
      if (decadeWord === 'twenty' || decadeWord === 'nineteen') {
        const decade = decadeWord === 'nineteen' ? '19' : '20'
        const unit = NUMBER_WORDS[unitWord] ?? unitWord
        // Prefer century+decade-unit when decade word is twenty/nineteen:
        // twenty twenty six → 20 + 26 when unit < 10 and middle is twenty
        if (decadeWord === 'twenty' && unit.length === 1) {
          out.push(`${century}2${unit}`)
        } else if (decadeWord === 'nineteen' && unit.length === 1) {
          out.push(`${century}1${unit}`)
        } else {
          out.push(`${century}${decade.slice(-1)}${unit}`)
        }
        i += 2
        continue
      }
    }

    // "twenty six" → 26
    if (NUMBER_WORDS[token] && i + 1 < tokens.length) {
      const next = tokens[i + 1]!
      const tens = NUMBER_WORDS[token]
      const ones = NUMBER_WORDS[next]
      if (
        tens &&
        ones &&
        Number(tens) >= 20 &&
        Number(tens) % 10 === 0 &&
        Number(ones) < 10
      ) {
        out.push(String(Number(tens) + Number(ones)))
        i += 1
        continue
      }
    }

    if (NUMBER_WORDS[token]) {
      out.push(NUMBER_WORDS[token]!)
      continue
    }

    // Digits with ordinal suffixes: 1st → 1
    const ordinal = token.match(/^(\d+)(st|nd|rd|th)$/)
    if (ordinal) {
      out.push(ordinal[1]!)
      continue
    }

    out.push(token)
  }

  return out.join(' ')
}

export function normalizeWord(word: string): string {
  return normalizeText(word)
}
