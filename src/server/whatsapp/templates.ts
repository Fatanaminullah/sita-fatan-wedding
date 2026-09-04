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
  /** True when every message needs a picture supplied for its header. */
  hasImageHeader: boolean
  /** The variable names a named template declares, empty for a positional one. */
  namedVariables: string[]
  /**
   * The approved body text, keyed by language code, variables still in it.
   *
   * Kept so a sent message can be written into the inbox transcript as the
   * sentence the guest actually read. Per language, because that is how Meta
   * approves a template and the send picks the language per guest.
   */
  bodyByLanguage: Record<string, string>
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
function bodyVariables(components: MetaComponent[]): { count: number; names: string[] } {
  const body = components.find((c) => c.type?.toUpperCase() === 'BODY')
  if (!body?.text) return { count: 0, names: [] }

  // Meta supports both shapes and a template is one or the other. Counting
  // only {{1}} reported the real invitation as having no variables at all,
  // which is how a wave sends nothing where a name should be.
  const named = [...body.text.matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi)].map((m) => m[1])
  if (named.length > 0) {
    const unique = [...new Set(named)]
    return { count: unique.length, names: unique }
  }

  const positional = body.text.match(/\{\{\s*\d+\s*\}\}/g) ?? []
  return { count: new Set(positional.map((m) => m.replace(/\s/g, ''))).size, names: [] }
}

/** The approved BODY text, variables and all. Null for a template with no body. */
function bodyText(components: MetaComponent[]): string | null {
  return components.find((c) => c.type?.toUpperCase() === 'BODY')?.text ?? null
}

function hasImageHeader(components: MetaComponent[]): boolean {
  return components.some(
    (c) => c.type?.toUpperCase() === 'HEADER' && c.format?.toUpperCase() === 'IMAGE'
  )
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
      if (row.language) {
        const text = bodyText(components)
        if (text) existing.bodyByLanguage[row.language] = text
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
      bodyVariables: bodyVariables(components).count,
      namedVariables: bodyVariables(components).names,
      hasUrlButton: hasUrlButton(components),
      hasImageHeader: hasImageHeader(components),
      bodyByLanguage:
        row.language && bodyText(components) ? { [row.language]: bodyText(components)! } : {},
    })
  }

  return {
    ok: true,
    templates: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}
