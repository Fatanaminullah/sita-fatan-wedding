/**
 * WhatsApp's own text marks, read back out of a message body.
 *
 * The inbox stores what was sent, verbatim, which means it stores the marks
 * too: `*bold*`, `_italic_`, `~struck~` and ```` ```monospace``` ````. On a
 * phone WhatsApp draws those. On the inbox screen they were printed as
 * literal asterisks and underscores, so the invitation read as though somebody
 * had typed punctuation into the middle of it.
 *
 * Parsing rather than a chain of replacements: marks nest, and a regex that
 * swaps `*...*` for a tag has no idea whether it is inside monospace, where
 * WhatsApp draws nothing at all.
 *
 * Deliberately conservative about what counts as a mark, because the cost is
 * asymmetric. A mark missed shows one stray asterisk. A mark invented eats the
 * characters around it: `wedding_invitation_v1` would lose its underscores and
 * gain an italic run nobody wrote.
 */

export type RichNode =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'strike'; children: RichNode[] }
  /** Literal by definition: WhatsApp draws no marks inside monospace. */
  | { type: 'code'; children: RichNode[] }

const MARKS = { '*': 'bold', _: 'italic', '~': 'strike' } as const
type MarkChar = keyof typeof MARKS

const MONOSPACE = '```'

function isMarkChar(char: string): char is MarkChar {
  return char === '*' || char === '_' || char === '~'
}

/** A letter or a digit, in any script: the inside of a word. */
function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char)
}

function isSpace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char)
}

/**
 * Where the mark opened at `start` closes, or -1.
 *
 * Three conditions, all WhatsApp's: the run is not empty, neither end of it is
 * whitespace, and the mark does not sit inside a word on either side.
 */
function closingIndex(text: string, start: number, mark: MarkChar): number {
  if (isWordChar(text[start - 1])) return -1
  if (isSpace(text[start + 1]) || text[start + 1] === undefined) return -1

  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] !== mark) continue
    if (i === start + 1) return -1 // empty run
    if (isSpace(text[i - 1])) continue
    if (isWordChar(text[i + 1])) continue
    return i
  }
  return -1
}

export function parseWhatsAppText(text: string): RichNode[] {
  const nodes: RichNode[] = []
  let plain = ''

  function flush() {
    if (plain) {
      nodes.push({ type: 'text', value: plain })
      plain = ''
    }
  }

  let i = 0
  while (i < text.length) {
    if (text.startsWith(MONOSPACE, i)) {
      const end = text.indexOf(MONOSPACE, i + MONOSPACE.length)
      if (end !== -1 && end > i + MONOSPACE.length) {
        flush()
        nodes.push({
          type: 'code',
          children: [{ type: 'text', value: text.slice(i + MONOSPACE.length, end) }],
        })
        i = end + MONOSPACE.length
        continue
      }
    }

    const char = text[i]
    if (isMarkChar(char)) {
      const end = closingIndex(text, i, char)
      if (end !== -1) {
        flush()
        nodes.push({
          type: MARKS[char],
          children: parseWhatsAppText(text.slice(i + 1, end)),
        })
        i = end + 1
        continue
      }
    }

    plain += char
    i += 1
  }

  flush()
  return nodes
}

/**
 * The same body with its marks taken off, for a one-line preview.
 *
 * WhatsApp's own chat list does this: the thread list is a scan of who said
 * what, and a bold run in a truncated line is noise rather than emphasis.
 */
export function whatsAppPlainText(text: string): string {
  function walk(nodes: RichNode[]): string {
    return nodes
      .map((node) => (node.type === 'text' ? node.value : walk(node.children)))
      .join('')
  }
  return walk(parseWhatsAppText(text))
}
