import { describe, it, expect } from 'vitest'
import { furthestDelivery, DELIVERY_STATES, type DeliveryState } from './delivery'

describe('the delivery ladder', () => {
  /*
   * Meta sends up to three callbacks per message, and only sends `read` when
   * the recipient allows read receipts. Half the guest list does not, so their
   * invitation sits on `delivered` however many times they read it.
   *
   * Opening the personal link is the signal that does not depend on anyone's
   * privacy setting, so it is the rung above read.
   */
  it('puts an opened link above every status Meta reports', () => {
    expect(furthestDelivery('delivered', true)).toBe('opened')
    expect(furthestDelivery('read', true)).toBe('opened')
    expect(furthestDelivery('sent', true)).toBe('opened')
    expect(furthestDelivery('queued', true)).toBe('opened')
  })

  it('leaves the reported status alone when the link was never opened', () => {
    expect(furthestDelivery('delivered', false)).toBe('delivered')
    expect(furthestDelivery('read', false)).toBe('read')
    expect(furthestDelivery('sent', false)).toBe('sent')
  })

  /*
   * The one place the ladder must not climb. A failed send is work outstanding:
   * that guest has no invitation and somebody has to fix it. They may still
   * have opened a link forwarded by a relative, and hiding the failure behind
   * "opened" would lose the only prompt to act.
   */
  it('never hides a failure behind an open', () => {
    expect(furthestDelivery('failed', true)).toBe('failed')
    expect(furthestDelivery('failed', false)).toBe('failed')
  })

  /* Nothing was sent, so there is no delivery to describe. */
  it('leaves a guest with no send alone', () => {
    expect(furthestDelivery('none', true)).toBe('none')
    expect(furthestDelivery('none', false)).toBe('none')
  })

  /*
   * Rank, not sequence. Meta's callbacks are not ordered: a `read` can arrive
   * after the guest has already opened the link, and under "latest wins" that
   * would walk them backwards from Opened to Read.
   */
  it('takes the furthest rung, never the latest event', () => {
    const ranks = DELIVERY_STATES.map((s) => s)
    expect(ranks.indexOf('opened')).toBeGreaterThan(ranks.indexOf('read'))
    expect(ranks.indexOf('read')).toBeGreaterThan(ranks.indexOf('delivered'))
    expect(ranks.indexOf('delivered')).toBeGreaterThan(ranks.indexOf('sent'))
  })

  /*
   * The webhook writes whatever string Meta sends. An unknown one must not
   * crash a screen or silently read as delivered.
   */
  it('passes an unrecognised status through untouched', () => {
    expect(furthestDelivery('something_new' as DeliveryState, false)).toBe('something_new')
    expect(furthestDelivery('something_new' as DeliveryState, true)).toBe('opened')
  })
})
