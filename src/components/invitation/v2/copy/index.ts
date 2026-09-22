import { en } from './en'
import { id } from './id'
import type { Copy, Lang } from './types'

export type { Copy, Lang, Split } from './types'

export const COPY: Record<Lang, Copy> = { en, id }

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'id'
}
