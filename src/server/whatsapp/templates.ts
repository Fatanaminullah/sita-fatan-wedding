/**
 * What Meta actually has approved.
 *
 * A template is only sendable once Meta has approved that exact name in that
 * exact language, and a rejected one usually comes back resubmitted under a
 * new name. Typing the name into a field and hoping is how a wave discovers at
 * send time that it has been pointing at nothing.
 *
 * Needs `WA_WABA_ID` and a `WA_ACCESS_TOKEN` carrying the
 * `whatsapp_business_management` scope. Both already exist in .env.example.
 */

const GRAPH_VERSION = 'v21.0'

export type ApprovedTemplate = {
  name: string
  /** Language codes this template is approved in, e.g. ['en', 'id']. */
  languages: string[]
  /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED. */
  status: string
  category: string
  /** How many body variables it declares, so a mismatch is visible up front. */
  bodyVariables: number
  /** True when it has a URL button whose parameter we would need to fill. */
  hasUrlButton: boolean
}

export type TemplateListResult =
  | { ok: true; templates: ApprovedTemplate[] }
  | { ok: false; error: string }

type MetaComponent = {
  type?: string
  text?: string
  format?: string
  buttons?: Array<{ type?: string; url?: string }>
}

type MetaTemplate = {
  name?: string
  language?: string
  status?: string
  category?: string
  components?: MetaComponent[]
}

/** Counts {{1}}, {{2}}, ... in a body, which is what the send has to supply. */
function countBodyVariables(components: MetaComponent[]): number {
  const body = components.find((c) => c.type?.toUpperCase() === 'BODY')
  if (!body?.text) return 0
  const found = body.text.match(/\{\{\s*\d+\s*\}\}/g)
  if (!found) return 0
  // Distinct positions: a template may repeat {{1}} and it is still one value.
  return new Set(found.map((m) => m.replace(/\s/g, ''))).size
}

function hasUrlButton(components: MetaComponent[]): boolean {
  return components.some(
    (c) =>
      c.type?.toUpperCase() === 'BUTTONS' &&
      (c.buttons ?? []).some((b) => b.type?.toUpperCase() === 'URL')
  )
}

/**
 * List the templates on this WhatsApp Business Account.
 *
 * Returns an error rather than throwing: a screen that cannot reach Meta
 * should still let somebody type a name in by hand, not refuse to load.
 */
export async function listTemplates(): Promise<TemplateListResult> {
  const wabaId = process.env.WA_WABA_ID
  const token = process.env.WA_ACCESS_TOKEN

  if (!wabaId || !token) {
    return {
      ok: false,
      error:
        'Set WA_WABA_ID and WA_ACCESS_TOKEN to load the approved templates. Until then a name can be typed in by hand.',
    }
  }

  let response: Response
  try {
    response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?limit=200&fields=name,language,status,category,components`,
      {
        headers: { authorization: `Bearer ${token}` },
        // Templates change rarely, and a wave screen reloading should not
        // hammer Meta. A minute is short enough to see a fresh approval.
        next: { revalidate: 60 },
      }
    )
  } catch {
    return { ok: false, error: 'Could not reach WhatsApp to list the templates.' }
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: MetaTemplate[]
    error?: { message?: string }
  } | null

  if (!response.ok || payload?.error) {
    // The message can name the account, not the token.
    return {
      ok: false,
      error: payload?.error?.message ?? `WhatsApp refused the template list (HTTP ${response.status}).`,
    }
  }

  // Meta returns one row per name-and-language pair. The screen picks a name;
  // the language is chosen per guest at send time, so they collapse here.
  const byName = new Map<string, ApprovedTemplate>()

  for (const row of payload?.data ?? []) {
    if (!row.name) continue
    const components = row.components ?? []
    const existing = byName.get(row.name)

    if (existing) {
      if (row.language && !existing.languages.includes(row.language)) {
        existing.languages.push(row.language)
      }
      // A name is only as sendable as its weakest variant: if the Indonesian
      // one is still pending, half the guest list cannot be reached.
      if (row.status && row.status.toUpperCase() !== 'APPROVED') {
        existing.status = row.status
      }
      continue
    }

    byName.set(row.name, {
      name: row.name,
      languages: row.language ? [row.language] : [],
      status: row.status ?? 'UNKNOWN',
      category: row.category ?? 'UNKNOWN',
      bodyVariables: countBodyVariables(components),
      hasUrlButton: hasUrlButton(components),
    })
  }

  return {
    ok: true,
    templates: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}
