export function buildDiff<T extends Record<string, unknown>>(
  before: Partial<T> | null,
  after: Partial<T> | null,
  fields: readonly (keyof T)[]
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const field of fields) {
    const oldValue = before ? before[field] ?? null : null
    const newValue = after ? after[field] ?? null : null
    if (oldValue !== newValue) {
      diff[field as string] = { old: oldValue, new: newValue }
    }
  }
  return diff
}
