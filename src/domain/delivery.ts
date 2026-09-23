/**
 * How far an invitation actually got.
 *
 * Meta sends up to three callbacks per message: sent, delivered, read. The
 * last one only arrives when the recipient allows read receipts, which is a
 * per-person privacy setting, so a guest who reads their invitation twice a
 * day can sit on `delivered` forever. On the first wave, 23 of the 30 guests
 * showing `delivered` had already opened their personal link.
 *
 * Opening that link is the signal that does not depend on anyone's settings,
 * so it is the rung above read.
 *
 * Nothing here is stored. The ladder is assembled when a row is read, and
 * `wa_sends.status` stays a faithful record of what Meta said. That is
 * deliberate: the webhook's update to `wa_sends` carries no ordering guard, so
 * a written-in `opened` would be overwritten by the next callback and the
 * guest would visibly go backwards.
 */

/** In order, lowest rung to highest. */
export const DELIVERY_STATES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'opened',
] as const

export type DeliveryState = 'none' | 'failed' | (typeof DELIVERY_STATES)[number]

/**
 * The furthest rung reached, given what Meta last reported and whether the
 * guest has opened their invitation.
 *
 * Rank, not sequence. Meta's callbacks are not ordered, so a `read` arriving
 * after the guest has already opened the link must not walk them back down.
 *
 * Two states never climb:
 *
 * - `failed`, because it is work outstanding. That guest has no invitation and
 *   somebody has to fix it. They may still have opened a link a relative
 *   forwarded them, and hiding the failure behind "opened" would lose the only
 *   prompt to act on it.
 * - `none`, because nothing was sent, so there is no delivery to describe.
 *
 * An unrecognised status passes through untouched rather than being read as
 * anything in particular: the webhook writes whatever string Meta sends, and a
 * new one must not crash a screen or quietly become `delivered`.
 */
export function furthestDelivery(reported: DeliveryState, opened: boolean): DeliveryState {
  if (reported === 'failed' || reported === 'none') return reported
  return opened ? 'opened' : reported
}
