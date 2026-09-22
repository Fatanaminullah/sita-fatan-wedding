import { describe, it, expect } from 'vitest'
import { parseWhatsAppText, whatsAppPlainText, type RichNode } from './wa-format'

/** Compact shape for asserting, so the expectations stay readable. */
function flat(nodes: RichNode[]): string {
  return nodes
    .map((node) =>
      node.type === 'text' ? node.value : `${node.type}(${flat(node.children)})`
    )
    .join('')
}

describe('parseWhatsAppText', () => {
  it('leaves plain text alone', () => {
    expect(flat(parseWhatsAppText('Hello there'))).toBe('Hello there')
  })

  it('reads the four marks WhatsApp draws', () => {
    expect(flat(parseWhatsAppText('*bold*'))).toBe('bold(bold)')
    expect(flat(parseWhatsAppText('_italic_'))).toBe('italic(italic)')
    expect(flat(parseWhatsAppText('~struck~'))).toBe('strike(struck)')
    expect(flat(parseWhatsAppText('```mono```'))).toBe('code(mono)')
  })

  it('reads a mark in the middle of a sentence', () => {
    expect(flat(parseWhatsAppText('Please reply before _24 September 2026_.'))).toBe(
      'Please reply before italic(24 September 2026).'
    )
  })

  it('nests one mark inside another', () => {
    expect(flat(parseWhatsAppText('*bold and _italic_ together*'))).toBe(
      'bold(bold and italic(italic) together)'
    )
  })

  // The real invitation body, which is the reason this exists at all.
  it('reads the shape the approved templates actually use', () => {
    expect(
      flat(parseWhatsAppText('*Sita Cahyani Arasy*\n_Daughter of Bapak Siswoko_'))
    ).toBe('bold(Sita Cahyani Arasy)\nitalic(Daughter of Bapak Siswoko)')
  })

  /* ----------------------------------------------------------- not a mark */

  it('leaves an unmatched marker as the character it is', () => {
    expect(flat(parseWhatsAppText('2 * 3 = 6'))).toBe('2 * 3 = 6')
    expect(flat(parseWhatsAppText('*not closed'))).toBe('*not closed')
  })

  // WhatsApp does not italicise inside a word, and neither may we: a template
  // name, a filename or a slug would otherwise lose its underscores and gain
  // an italic run nobody wrote.
  it('ignores a marker sitting inside a word', () => {
    expect(flat(parseWhatsAppText('wedding_invitation_v1'))).toBe('wedding_invitation_v1')
    expect(flat(parseWhatsAppText('a*b*c'))).toBe('a*b*c')
  })

  // A marker with a space just inside it is a stray asterisk, not an opening.
  it('ignores a marker padded with whitespace', () => {
    expect(flat(parseWhatsAppText('* not bold *'))).toBe('* not bold *')
    expect(flat(parseWhatsAppText('one * two * three'))).toBe('one * two * three')
  })

  it('refuses an empty mark', () => {
    expect(flat(parseWhatsAppText('**'))).toBe('**')
  })

  // Monospace is literal: WhatsApp does not draw marks inside it.
  it('does not read marks inside monospace', () => {
    expect(flat(parseWhatsAppText('```a *b* c```'))).toBe('code(a *b* c)')
  })

  it('handles an empty body', () => {
    expect(parseWhatsAppText('')).toEqual([])
  })
})

describe('whatsAppPlainText', () => {
  it('takes the marks off and keeps the words', () => {
    expect(whatsAppPlainText('*Sabtu, 10 Oktober 2026.*')).toBe('Sabtu, 10 Oktober 2026.')
    expect(whatsAppPlainText('reply before _24 September_.')).toBe('reply before 24 September.')
  })

  it('leaves a stray marker where it stands, because it is not a mark', () => {
    expect(whatsAppPlainText('2 * 3')).toBe('2 * 3')
    expect(whatsAppPlainText('wedding_invitation_v1')).toBe('wedding_invitation_v1')
  })
})
