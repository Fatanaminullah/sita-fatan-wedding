/**
 * Shared styling for the hand-rolled native `<select>` elements. Base UI's
 * Select is a listbox rather than a native control, and the filter rows across
 * guests, waitlist, audit and accounts deliberately use the OS picker instead:
 * on a phone it is a wheel the thumb already knows.
 *
 * This existed as four near-identical string literals, which is how token
 * drift starts. One place also fixes one bug in all four: `text-base` below
 * `md`, because Safari on iOS zooms the whole page when a control smaller than
 * 16px takes focus, and every parent using this app is on a phone.
 *
 * Width is not set here. Add `w-full` at the call site where the field fills
 * its row.
 */
export const nativeFieldClass =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm'
