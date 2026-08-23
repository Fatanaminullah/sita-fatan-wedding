/**
 * Which language variant of a WhatsApp template a guest receives.
 *
 * Meta holds templates as language variants under one name
 * (`wedding_invitation_v1` in `en` and `id`), so the choice is ours to make
 * per guest, not Meta's.
 */
export type GuestLanguage = 'en' | 'id'

/**
 * Indonesian honorifics, as the guest sheet spells them. Titles survive in
 * `guests.name` (the slugify work deliberately kept them), so the name itself
 * is the only signal available without asking 336 people.
 */
export const HONORIFICS = [
  'Pak',
  'Bapak',
  'Bu',
  'Ibu',
  'Om',
  'Tante',
  'Mbah',
  'Eyang',
  'Haji',
  'Hj',
] as const

// Whole words only. A prefix match would read "Bunga" as "Bu", "Omar" as "Om",
// and "Hjalmar" as "Hj". The trailing dot is optional because the sheet holds
// both "Hj Siti" and "Hj. Siti".
const HONORIFIC_PATTERN = new RegExp(`(?:^|\\s)(?:${HONORIFICS.join('|')})\\.?(?=\\s|$)`, 'i')

/**
 * Seed a guest's template language from their name.
 *
 * **This is a seed, not an answer.** It is right often enough to save the
 * couple most of 336 decisions and wrong often enough that every row is
 * expected to be reviewed by hand from the guests screen. An untitled name is
 * not evidence of anything, so it lands on the default rather than on a guess.
 *
 * Deliberately biased toward recall: an honorific anywhere in the name counts,
 * because the sheet holds entries like "Keluarga Bapak Ahmad". Over-tagging
 * costs a correction; under-tagging costs an English template sent to someone
 * who reads Indonesian.
 */
export function seedLanguageFromName(name: string): GuestLanguage {
  return HONORIFIC_PATTERN.test(name ?? '') ? 'id' : 'en'
}
