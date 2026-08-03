export type UsernameCheck = { ok: true; username: string } | { ok: false; error: string }

// Handles are read out loud when a password is handed over, so keep them to
// lowercase letters, digits and separators, and never let one start or end
// with a separator. Mirrored by the profiles_username_format check constraint.
const USERNAME = /^[a-z0-9][a-z0-9._-]{0,30}[a-z0-9]$/
const MIN = 2
const MAX = 32

export function normalizeUsername(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase()
}

/**
 * The login field accepts either identifier, so it needs a rule to tell them
 * apart. An `@` is the whole rule: usernames may not contain one.
 */
export function looksLikeEmail(raw: string | null | undefined): boolean {
  return (raw ?? '').includes('@')
}

export function checkUsername(raw: string | null | undefined): UsernameCheck {
  const username = normalizeUsername(raw)
  if (!username) return { ok: false, error: 'Username is required.' }
  if (username.length < MIN || username.length > MAX) {
    return { ok: false, error: `Username has to be ${MIN} to ${MAX} characters.` }
  }
  if (!USERNAME.test(username)) {
    return {
      ok: false,
      error: 'Username can use letters, digits, dot, dash and underscore, and has to start and end with a letter or digit.',
    }
  }
  return { ok: true, username }
}
