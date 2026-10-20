/**
 * One spoken step per line.
 * Plain text is a step. A leading dash, star, dot, or other bullet is removed,
 * and so is a number or letter (`1.`, `1)`, `a.`, `(1)`), with or without a
 * space after the marker. A marker with nothing after it is skipped. An
 * indented line with no marker continues the previous step.
 */

const BULLET_SYMBOLS = new Set(
  Array.from(
    '.-*+>•·∙‧⋅●○◦◉◎▪▫■□◻◼◾◽‣▸▹▶►▷◆◇◈★☆✦✧✓✔✅☐☑→⇒➜➤➢➔»›⁃–—−∗✱＊․',
  ),
)

const CHECKBOX_RE = /^\[(?: |x|X|✓|✔)\]\s*/

export function parseBullets(script: string): string[] {
  const bullets: string[] = []
  const lines = script.split(/\r\n|\r|\n/)

  for (const line of lines) {
    if (!line.trim()) continue

    const indented = /^\s+\S/.test(line)
    const { hadMarker, content } = stripLeadingMarker(line.trim())
    if (!content) continue

    if (indented && !hadMarker && bullets.length > 0) {
      bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${content}`
      continue
    }

    bullets.push(content)
  }

  return bullets
}

function stripLeadingMarker(trimmed: string): { hadMarker: boolean; content: string } {
  const numbered = stripNumbered(trimmed)
  if (numbered !== null) {
    return { hadMarker: true, content: stripCheckbox(numbered) }
  }

  const symbol = stripBulletSymbols(trimmed)
  if (symbol !== null) {
    return { hadMarker: true, content: stripCheckbox(symbol.trim()) }
  }

  return { hadMarker: false, content: stripCheckbox(trimmed) }
}

function stripCheckbox(value: string): string {
  return value.replace(CHECKBOX_RE, '').trim()
}

/** Dash, star, dot, and the other glyphs people use as a bullet. */
function stripBulletSymbols(line: string): string | null {
  let index = 0
  while (index < line.length && BULLET_SYMBOLS.has(line[index]!)) {
    const symbol = line[index]!
    const next = line[index + 1]
    if ((symbol === '.' || symbol === '․') && next !== undefined && /\d/.test(next)) break
    if (isDash(symbol) && index === 0 && next !== undefined && /\d/.test(next)) break
    index += 1
  }
  if (index === 0) return null
  return line.slice(index)
}

function isDash(symbol: string): boolean {
  return symbol === '-' || symbol === '–' || symbol === '—' || symbol === '−' || symbol === '⁃'
}

/**
 * `1.` `1)` `1:` `a.` `(1)` `iv.`, including when the text is flush
 * against the marker. Decimals, clock times, and `i.e.` / `e.g.` stay put.
 */
function stripNumbered(line: string): string | null {
  const dashed = /^([0-9]{1,3})\s+[-–—]\s+/.exec(line)
  if (dashed) return line.slice(dashed[0].length).trim()

  const paren = /^\(([0-9]{1,3}|[A-Za-z]{1,8})\)/.exec(line)
  if (paren) {
    const token = paren[1] ?? ''
    if (/[A-Za-z]/.test(token) && token.length > 1 && !isRomanNumeral(token)) return null
    return line.slice(paren[0].length).trim()
  }

  const match = /^([0-9]{1,3}|[A-Za-z]{1,8})([.):])/.exec(line)
  if (!match) return null
  const token = match[1] ?? ''
  const separator = match[2] ?? ''
  const digits = /^[0-9]+$/.test(token)
  if (!digits && !isRomanNumeral(token) && token.length !== 1) return null

  const rest = line.slice(match[0].length)
  if ((separator === '.' || separator === ':') && /^\d/.test(rest)) return null
  if (!digits && /^[A-Za-z]\./.test(rest)) return null
  return rest.trim()
}

function isRomanNumeral(value: string): boolean {
  return /^(?=.)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i.test(value)
}
