/**
 * The tunnel's geometry, in one place because two files need to agree on it:
 * the scene moves the photographs, and the section buys the scroll that moves
 * them. Kept out of tunnel-scene.tsx so the section can do its arithmetic
 * without pulling three.js into the first bundle.
 */

/** How deep the tunnel runs. A photograph's whole life happens inside this. */
export const DEPTH = 50
/** Distance between one photograph and the next along the ribbon. */
export const SPACING = 5
/** Past this depth a photograph has gone by the camera for good. */
export const PASSED = 0.45 * DEPTH
/** Units of travel per screen of scroll. Three photographs a screen. */
export const TRAVEL_PER_SCREEN = 15

/**
 * How far along the ribbon already is when the hold begins, so the section
 * is entered with photographs in flight rather than an empty black tunnel.
 */
export const ENTRY = 2.5 * SPACING

/**
 * How far the ribbon must travel for every photograph to have passed the
 * camera. The last one leaves before the hold ends, so the section finishes
 * on an empty tunnel rather than cutting away mid-photograph.
 */
export function ribbonTravel(count: number) {
  return (count - 1) * SPACING + PASSED
}
