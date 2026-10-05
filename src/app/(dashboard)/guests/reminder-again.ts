'use client'

import { useState, useTransition } from 'react'
import { sendWave } from '@/server/actions/wave-actions'

/**
 * Send the reminder once more to one guest who got it and has not answered.
 *
 * The same server path as the log's Send again (`resend`, one guest), so every
 * rule it applies still applies here: an answered guest is refused with the
 * reason, and the daily limit still counts. Two taps, because a second message
 * lands on a real phone.
 */
export function useReminderAgain(guestId: string) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function press() {
    if (pending || phase === 'sent') return
    if (phase === 'idle') {
      setError(null)
      setPhase('confirm')
      return
    }
    startTransition(async () => {
      const result = await sendWave({ kind: 'reminder', guestIds: [guestId], resend: true })
      if ('error' in result) {
        setError(result.error)
        setPhase('idle')
        return
      }
      if (result.sent === 0) {
        setError(result.problems[0]?.message ?? 'Not sent. Check the message log for why.')
        setPhase('idle')
        return
      }
      setPhase('sent')
    })
  }

  const label = pending
    ? 'Sending...'
    : phase === 'sent'
      ? 'Reminder sent'
      : phase === 'confirm'
        ? 'Tap again to send'
        : 'Send reminder again'

  return { press, label, pending, done: phase === 'sent', error }
}
