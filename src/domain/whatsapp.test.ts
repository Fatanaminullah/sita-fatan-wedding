import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  buildTemplateComponents,
  isFetchableByMeta,
  isLikelyBot,
  isValidButtonParam,
  verifySignature,
  parseWebhookPayload,
  renderTemplateBody,
  isWithinServiceWindow,
  serviceWindowExpiresAt,
  SERVICE_WINDOW_MS,
  describeSendFailure,
} from './whatsapp'

const SECRET = 'test-app-secret'

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

describe('verifySignature', () => {
  it('accepts a body signed with the app secret', () => {
    const body = '{"object":"whatsapp_business_account"}'
    expect(verifySignature(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects a body signed with a different secret', () => {
    const body = '{"object":"whatsapp_business_account"}'
    expect(verifySignature(body, sign(body, 'wrong-secret'), SECRET)).toBe(false)
  })

  it('rejects a tampered body', () => {
    const signature = sign('{"a":1}')
    expect(verifySignature('{"a":2}', signature, SECRET)).toBe(false)
  })

  it('rejects a missing or malformed header instead of throwing', () => {
    const body = '{"a":1}'
    expect(verifySignature(body, null, SECRET)).toBe(false)
    expect(verifySignature(body, '', SECRET)).toBe(false)
    expect(verifySignature(body, 'sha256=', SECRET)).toBe(false)
    expect(verifySignature(body, 'deadbeef', SECRET)).toBe(false)
    expect(verifySignature(body, 'sha1=abc', SECRET)).toBe(false)
    // Not hex, and the wrong length: timingSafeEqual throws on both if the
    // buffers are handed to it unchecked.
    expect(verifySignature(body, 'sha256=zzzz', SECRET)).toBe(false)
  })

  it('rejects everything when the app secret is empty, rather than accepting everything', () => {
    const body = '{"a":1}'
    expect(verifySignature(body, sign(body, ''), '')).toBe(false)
  })
})

// The shapes below are Meta Cloud API webhook payloads.
function messagePayload(message: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1552065343333774',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '628519980043', phone_number_id: '1344518555405220' },
              contacts: [{ profile: { name: 'Budi' }, wa_id: '6281234567890' }],
              messages: [message],
            },
          },
        ],
      },
    ],
  }
}

describe('parseWebhookPayload, inbound messages', () => {
  it('normalizes a text message', () => {
    const { messages, statuses } = parseWebhookPayload(
      messagePayload({
        from: '6281234567890',
        id: 'wamid.AAA',
        timestamp: '1755950400',
        type: 'text',
        text: { body: 'Hadir, terima kasih' },
      })
    )
    expect(statuses).toEqual([])
    expect(messages).toEqual([
      {
        waId: '6281234567890',
        providerMessageId: 'wamid.AAA',
        type: 'text',
        body: 'Hadir, terima kasih',
        // Typed, not tapped. Only a real button or list row carries an id.
        replyId: null,
        sentAt: new Date(1755950400 * 1000),
        profileName: 'Budi',
      },
    ])
  })

  it('pulls readable text out of button, interactive, and reaction replies', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ type: 'button', button: { text: 'Hadir', payload: 'YES' } }, 'Hadir'],
      [
        { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'a', title: 'Tidak hadir' } } },
        'Tidak hadir',
      ],
      [
        { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'b', title: 'Akad saja' } } },
        'Akad saja',
      ],
      [{ type: 'reaction', reaction: { message_id: 'wamid.X', emoji: '❤️' } }, '❤️'],
    ]
    for (const [extra, expected] of cases) {
      const { messages } = parseWebhookPayload(
        messagePayload({ from: '628', id: `wamid.${expected}`, timestamp: '1755950400', ...extra })
      )
      expect(messages[0].body).toBe(expected)
    }
  })

  it('keeps a media message with a null body, because the row is the proof someone wrote', () => {
    const { messages } = parseWebhookPayload(
      messagePayload({
        from: '6281234567890',
        id: 'wamid.IMG',
        timestamp: '1755950400',
        type: 'image',
        image: { id: 'media-1', mime_type: 'image/jpeg' },
      })
    )
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('image')
    expect(messages[0].body).toBeNull()
  })

  it('falls back to the message`s own from when contacts is absent', () => {
    const payload = messagePayload({
      from: '6289999999999',
      id: 'wamid.NOCONTACT',
      timestamp: '1755950400',
      type: 'text',
      text: { body: 'hi' },
    })
    delete (payload.entry[0].changes[0].value as Record<string, unknown>).contacts
    const { messages } = parseWebhookPayload(payload)
    expect(messages[0].waId).toBe('6289999999999')
    expect(messages[0].profileName).toBeNull()
  })
})

describe('parseWebhookPayload, delivery statuses', () => {
  function statusPayload(status: Record<string, unknown>) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1552065343333774',
          changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses: [status] } }],
        },
      ],
    }
  }

  it('normalizes a delivered status', () => {
    const { messages, statuses } = parseWebhookPayload(
      statusPayload({ id: 'wamid.SENT', status: 'delivered', timestamp: '1755950500', recipient_id: '628' })
    )
    expect(messages).toEqual([])
    expect(statuses).toEqual([
      {
        providerMessageId: 'wamid.SENT',
        status: 'delivered',
        statusAt: new Date(1755950500 * 1000),
        errorCode: null,
        errorTitle: null,
      },
    ])
  })

  it('carries the first error through on a failed status', () => {
    const { statuses } = parseWebhookPayload(
      statusPayload({
        id: 'wamid.FAIL',
        status: 'failed',
        timestamp: '1755950500',
        errors: [{ code: 131047, title: 'Re-engagement message', message: 'More than 24 hours' }],
      })
    )
    expect(statuses[0].errorCode).toBe(131047)
    expect(statuses[0].errorTitle).toBe('Re-engagement message')
  })

  it('drops a status vocabulary the database cannot store, rather than failing the insert', () => {
    const { statuses } = parseWebhookPayload(
      statusPayload({ id: 'wamid.X', status: 'deleted', timestamp: '1755950500' })
    )
    expect(statuses).toEqual([])
  })
})

describe('parseWebhookPayload, malformed input', () => {
  // Meta retries any non-200 and disables a webhook that keeps failing, so a
  // parser that throws on an unexpected shape takes the endpoint down.
  it('returns empty results instead of throwing', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      '',
      42,
      {},
      { entry: null },
      { entry: [] },
      { entry: [{}] },
      { entry: [{ changes: null }] },
      { entry: [{ changes: [{}] }] },
      { entry: [{ changes: [{ value: { messages: 'not-an-array' } }] }] },
      { entry: [{ changes: [{ value: { messages: [null] } }] }] },
      { entry: [{ changes: [{ value: { messages: [{ id: 'no-timestamp', from: '1', type: 'text' }] } }] }] },
    ]
    for (const payload of garbage) {
      expect(() => parseWebhookPayload(payload)).not.toThrow()
      const result = parseWebhookPayload(payload)
      expect(result.messages).toEqual([])
      expect(result.statuses).toEqual([])
    }
  })

  it('keeps the good entries when one entry in a batch is malformed', () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [null] } }] },
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '628', id: 'wamid.GOOD', timestamp: '1755950400', type: 'text', text: { body: 'ok' } },
                ],
              },
            },
          ],
        },
      ],
    }
    expect(parseWebhookPayload(payload).messages).toHaveLength(1)
  })
})

describe('service window', () => {
  const inbound = new Date('2026-08-23T10:00:00+07:00')

  it('is 24 hours', () => {
    expect(SERVICE_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
    expect(serviceWindowExpiresAt(inbound)).toEqual(new Date('2026-08-24T10:00:00+07:00'))
  })

  it('is open right up to the boundary and shut on it', () => {
    expect(isWithinServiceWindow(inbound, new Date(inbound.getTime() + SERVICE_WINDOW_MS - 1))).toBe(true)
    expect(isWithinServiceWindow(inbound, new Date(inbound.getTime() + SERVICE_WINDOW_MS))).toBe(false)
  })

  it('is shut when the guest has never written', () => {
    expect(isWithinServiceWindow(null, inbound)).toBe(false)
  })
})

describe('buildTemplateComponents', () => {
  it('puts the body variables in order', () => {
    const components = buildTemplateComponents({
      bodyParams: ['Rasyid dan Rani', '24 September 2026'],
    })
    expect(components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Rasyid dan Rani' },
          { type: 'text', text: '24 September 2026' },
        ],
      },
    ])
  })

  // The trap. Both are called {{1}} in the template and they are different
  // variables; crossing them sends every guest a broken link addressed to
  // somebody else.
  it('keeps the button variable out of the body parameters', () => {
    const components = buildTemplateComponents({
      bodyParams: ['Rasyid dan Rani', '24 September 2026'],
      buttonParam: 'rasyid-rani-7f3a9c2e',
    })
    const body = components.find((c) => c.type === 'body')
    const button = components.find((c) => c.type === 'button')

    expect(body?.parameters).toHaveLength(2)
    expect(button?.parameters).toEqual([{ type: 'text', text: 'rasyid-rani-7f3a9c2e' }])
    expect(JSON.stringify(body)).not.toContain('rasyid-rani')
    expect(JSON.stringify(button)).not.toContain('Rasyid dan Rani')
  })

  it('numbers a single button as index 0', () => {
    const components = buildTemplateComponents({ bodyParams: [], buttonParam: 'a-slug' })
    const button = components.find((c) => c.type === 'button')
    expect(button).toMatchObject({ sub_type: 'url', index: '0' })
  })

  it('omits the button entirely when there is no parameter for it', () => {
    const components = buildTemplateComponents({ bodyParams: ['Someone'] })
    expect(components.some((c) => c.type === 'button')).toBe(false)
  })

  it('omits the body when the template has no variables', () => {
    const components = buildTemplateComponents({ bodyParams: [] })
    expect(components).toEqual([])
  })

  it('puts an image header before the body', () => {
    // The QR ticket. Order matters: a header after a body is the kind of thing
    // that works until it does not.
    const components = buildTemplateComponents({
      bodyParams: ['Someone'],
      headerImageUrl: 'https://example.test/qr/abc.png',
    })
    expect(components[0].type).toBe('header')
    expect(components[1].type).toBe('body')
  })

  it('treats an empty button parameter as no button', () => {
    // Guards against sending `.../to/` with nothing after it, which would take
    // every guest to a 404 rather than to their invitation.
    const components = buildTemplateComponents({ bodyParams: ['Someone'], buttonParam: '' })
    expect(components.some((c) => c.type === 'button')).toBe(false)
  })
})

describe('isValidButtonParam', () => {
  it('accepts a slug', () => {
    expect(isValidButtonParam('rasyid-rani-7f3a9c2e')).toBe(true)
  })

  // The real template registers https://www.sitafatan.wedding/{{1}}, so the
  // value carries the `to/` too. An earlier version refused every slash and
  // would have rejected the only correct answer.
  it('accepts a path fragment, which is what the real template needs', () => {
    expect(isValidButtonParam('to/rasyid-rani-7f3a9c2e')).toBe(true)
  })

  it('rejects a whole URL', () => {
    // Meta appends this to the registered base, so a full URL produces
    // https://www.sitafatan.wedding/https://... and looks fine in the request.
    expect(isValidButtonParam('https://www.sitafatan.wedding/to/rasyid-rani')).toBe(false)
  })

  it('rejects a leading slash, which would double up on the base', () => {
    expect(isValidButtonParam('/to/rasyid-rani')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidButtonParam('')).toBe(false)
  })

  it('rejects a slug with a space', () => {
    expect(isValidButtonParam('rasyid rani')).toBe(false)
  })
})

describe('named body variables', () => {
  // The real wedding_invitation_v1 is written with {{name}} and
  // {{rsvp_deadline}}. Meta rejects positional parameters sent to it, so this
  // is not a stylistic choice.
  it('sends named parameters when the template uses names', () => {
    const components = buildTemplateComponents({
      bodyParams: [],
      namedParams: { name: 'Rasyid dan Rani', rsvp_deadline: '24 September 2026' },
    })
    const body = components.find((c) => c.type === 'body')
    expect(body?.parameters).toEqual([
      { type: 'text', parameter_name: 'name', text: 'Rasyid dan Rani' },
      { type: 'text', parameter_name: 'rsvp_deadline', text: '24 September 2026' },
    ])
  })

  it('prefers names over positions when both are given', () => {
    const components = buildTemplateComponents({
      bodyParams: ['ignored'],
      namedParams: { name: 'Someone' },
    })
    const body = components.find((c) => c.type === 'body')
    expect(body?.parameters).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('ignored')
  })

  it('still sends positional parameters for a template written that way', () => {
    const components = buildTemplateComponents({ bodyParams: ['A', 'B'], namedParams: null })
    const body = components.find((c) => c.type === 'body')
    expect(body?.parameters).toEqual([
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B' },
    ])
  })

  // The invitation carries an image header on every send, not just the ticket.
  it('puts the header first alongside named parameters', () => {
    const components = buildTemplateComponents({
      bodyParams: [],
      namedParams: { name: 'Someone' },
      headerImageUrl: 'https://example.test/invite.png',
      buttonParam: 'to/someone-1234',
    })
    expect(components.map((c) => c.type)).toEqual(['header', 'body', 'button'])
  })
})

describe('isLikelyBot', () => {
  // The one that matters: WhatsApp fetches every link it is sent to build the
  // preview card, seconds after the wave goes out.
  it('catches the WhatsApp link preview fetch', () => {
    expect(isLikelyBot('WhatsApp/2.23.20.0 A')).toBe(true)
  })

  it('catches Meta’s crawler', () => {
    expect(isLikelyBot('facebookexternalhit/1.1')).toBe(true)
  })

  it('treats a missing user agent as a bot', () => {
    expect(isLikelyBot(null)).toBe(true)
    expect(isLikelyBot('')).toBe(true)
  })

  it('catches command line fetchers', () => {
    expect(isLikelyBot('curl/8.4.0')).toBe(true)
    expect(isLikelyBot('python-requests/2.31.0')).toBe(true)
  })

  it('lets a guest on an Android phone through', () => {
    expect(
      isLikelyBot(
        'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      )
    ).toBe(false)
  })

  it('lets a guest on an iPhone through', () => {
    expect(
      isLikelyBot(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
      )
    ).toBe(false)
  })

  it('lets a desktop browser through', () => {
    expect(
      isLikelyBot(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
    ).toBe(false)
  })
})

describe('the id behind a tap', () => {
  function envelope(message: Record<string, unknown>) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '628110000001', profile: { name: 'A Guest' } }],
                messages: [{ id: 'wamid.1', timestamp: '1756000000', from: '628110000001', ...message }],
              },
            },
          ],
        },
      ],
    }
  }

  // A quick reply on an approved template.
  it('reads button.payload', () => {
    const { messages } = parseWebhookPayload(
      envelope({ type: 'button', button: { text: 'Ya, saya hadir', payload: 'RSVP_YES' } })
    )
    expect(messages[0].replyId).toBe('RSVP_YES')
  })

  // A button we sent inside the open window.
  it('reads interactive.button_reply.id', () => {
    const { messages } = parseWebhookPayload(
      envelope({
        type: 'interactive',
        interactive: { button_reply: { id: 'RSVP_NO', title: 'Sorry, I cannot' } },
      })
    )
    expect(messages[0].replyId).toBe('RSVP_NO')
  })

  // A row of a list we sent inside the window.
  it('reads interactive.list_reply.id', () => {
    const { messages } = parseWebhookPayload(
      envelope({
        type: 'interactive',
        interactive: { list_reply: { id: 'RSVP_PAX_2', title: '2 people' } },
      })
    )
    expect(messages[0].replyId).toBe('RSVP_PAX_2')
  })

  // The whole reason the id is read rather than the words: a guest typing the
  // button's text must never count as having tapped it.
  it('gives typed text no reply id, however exactly it matches', () => {
    const { messages } = parseWebhookPayload(
      envelope({ type: 'text', text: { body: 'Ya, saya hadir' } })
    )
    expect(messages[0].replyId).toBeNull()
    expect(messages[0].body).toBe('Ya, saya hadir')
  })
})

describe('quick reply payloads', () => {
  // A template's quick-reply button carries no payload of its own. Whatever
  // comes back is whatever the sender attached, and attaching nothing means
  // the tap arrives as the button's own words — indistinguishable from a guest
  // typing them, which the conversation deliberately refuses to act on.
  it('attaches a payload per button, in order', () => {
    const components = buildTemplateComponents({
      bodyParams: [],
      namedParams: { name: 'Someone' },
      quickReplyPayloads: ['RSVP_YES', 'RSVP_NO'],
    })
    const buttons = components.filter((c) => c.type === 'button')
    expect(buttons).toEqual([
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'RSVP_YES' }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'RSVP_NO' }] },
    ])
  })

  it('adds nothing when the template has no quick replies', () => {
    const components = buildTemplateComponents({ bodyParams: ['A'] })
    expect(components.some((c) => c.type === 'button')).toBe(false)
  })
})

describe('isFetchableByMeta', () => {
  it('accepts a public https URL', () => {
    expect(isFetchableByMeta('https://www.sitafatan.wedding/opengraph-image.png')).toBe(true)
  })

  it('rejects localhost, which is what a local dev run builds', () => {
    expect(isFetchableByMeta('http://localhost:3000/opengraph-image.png')).toBe(false)
    expect(isFetchableByMeta('https://127.0.0.1/opengraph-image.png')).toBe(false)
  })

  it('rejects plain http, which Meta will not fetch', () => {
    expect(isFetchableByMeta('http://www.sitafatan.wedding/opengraph-image.png')).toBe(false)
  })

  it('rejects a private network address', () => {
    expect(isFetchableByMeta('https://192.168.1.20/invite.png')).toBe(false)
    expect(isFetchableByMeta('https://10.0.0.4/invite.png')).toBe(false)
    expect(isFetchableByMeta('https://172.16.4.4/invite.png')).toBe(false)
  })

  it('rejects anything that is not a URL at all', () => {
    expect(isFetchableByMeta('')).toBe(false)
    expect(isFetchableByMeta('opengraph-image.png')).toBe(false)
  })
})

describe('renderTemplateBody', () => {
  it('fills named variables', () => {
    expect(
      renderTemplateBody('Dear {{name}}, please reply by {{rsvp_deadline}}.', {
        named: { name: 'Yasmin', rsvp_deadline: '1 September 2026' },
      })
    ).toBe('Dear Yasmin, please reply by 1 September 2026.')
  })

  it('fills positional variables, which Meta numbers from one', () => {
    expect(renderTemplateBody('Hello {{1}} and {{2}}.', { positional: ['a', 'b'] })).toBe(
      'Hello a and b.'
    )
  })

  // An empty gap in the transcript would read as a template that sent nothing
  // there. Leaving the variable visible says plainly that it was not filled.
  it('leaves a variable nobody supplied exactly as written', () => {
    expect(renderTemplateBody('Dear {{name}}.', { named: {} })).toBe('Dear {{name}}.')
    expect(renderTemplateBody('Hello {{2}}.', { positional: ['only one'] })).toBe('Hello {{2}}.')
  })

  it('tolerates the spaced form Meta also accepts', () => {
    expect(renderTemplateBody('Hi {{ name }}.', { named: { name: 'Bayu' } })).toBe('Hi Bayu.')
  })
})

describe('describeSendFailure', () => {
  it('names the marketing cap and what to do', () => {
    const r = describeSendFailure('This message was not delivered to maintain healthy ecosystem engagement.')
    expect(r?.short).toBe('Held back by Meta: marketing limit')
    expect(r?.action).toMatch(/retry after a day/i)
  })
  it('recognises the error code alone', () => {
    expect(describeSendFailure('(#131049) something')?.short).toBe('Held back by Meta: marketing limit')
    expect(describeSendFailure('131026 Message Undeliverable')?.short).toBe('Number not on WhatsApp')
    expect(describeSendFailure('(#131047) Re-engagement message')?.short).toBe('Reply window closed')
  })
  it('passes an unknown message through, without an action', () => {
    expect(describeSendFailure('Something new from Meta')).toEqual({ short: 'Something new from Meta', action: null })
  })
  it('is null for no error', () => {
    expect(describeSendFailure(null)).toBeNull()
    expect(describeSendFailure('')).toBeNull()
  })
})
