import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  buildTemplateComponents,
  isValidButtonParam,
  verifySignature,
  parseWebhookPayload,
  isWithinServiceWindow,
  serviceWindowExpiresAt,
  SERVICE_WINDOW_MS,
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

  it('rejects a whole URL', () => {
    // Meta appends this to the registered base, so a full URL produces
    // https://www.sitafatan.wedding/to/https://... and looks fine in the request.
    expect(isValidButtonParam('https://www.sitafatan.wedding/to/rasyid-rani')).toBe(false)
  })

  it('rejects a path with a slash', () => {
    expect(isValidButtonParam('to/rasyid-rani')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidButtonParam('')).toBe(false)
  })

  it('rejects a slug with a space', () => {
    expect(isValidButtonParam('rasyid rani')).toBe(false)
  })
})
