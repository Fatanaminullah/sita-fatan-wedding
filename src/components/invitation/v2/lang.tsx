'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { COPY, isLang, type Copy, type Lang } from './copy'

const LANG_KEY = 'inv:lang'

type Ctx = { lang: Lang; copy: Copy; setLang: (l: Lang) => void }
const LangCtx = createContext<Ctx>({ lang: 'en', copy: COPY.en, setLang: () => {} })

/**
 * The language of every sentence on the page. It starts as the guest's own
 * language from their record (what the WhatsApp templates also use), and a
 * guest who switches is remembered on this device, so a reload keeps their
 * choice and the record is only the default.
 */
/**
 * "30 September", in the language being read.
 *
 * Indonesian and English happen to agree on September, and will not on every
 * month the couple might have chosen, so this is formatted rather than
 * assumed. Jakarta, because a date with no zone shifts a day for a guest
 * reading it from another one, and the deadline is a date rather than a
 * moment.
 */
function deadlineIn(lang: Lang, iso: string): string | null {
  const at = new Date(`${iso}T00:00:00+07:00`)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Jakarta',
  })
}

export function LangProvider({
  initial,
  deadline,
  children,
}: {
  initial: Lang
  /** From app_settings, or null when it has never been set. */
  deadline?: string | null
  children: ReactNode
}) {
  const [lang, setLangState] = useState<Lang>(initial)

  // After hydration, as the mute toggle does: the server rendered the
  // record's language, and a stored choice replaces it on the first frame.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(LANG_KEY)
        if (isLang(stored)) setLangState(stored)
      } catch {}
    })
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {}
  }, [])

  /*
   * The copy, with the real deadline written into it.
   *
   * The date used to be a literal in both copy files, and the couple set the
   * deadline somewhere else entirely, so the letter said 26 September while
   * app_settings said the 30th and the WhatsApp template dutifully sent the
   * 30th. Overriding here keeps the copy files about words and leaves one
   * place in the system that decides the date.
   *
   * An unset deadline leaves the copy file's own value standing rather than
   * printing an empty line; paper-letter only draws the sentence for a guest
   * who has not answered.
   */
  const value = useMemo(() => {
    const base = COPY[lang]
    const formatted = deadline ? deadlineIn(lang, deadline) : null
    const copy = formatted ? { ...base, deadlineLong: formatted } : base
    return { lang, copy, setLang }
  }, [lang, deadline, setLang])
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>
}

export function useCopy(): Copy {
  return useContext(LangCtx).copy
}

export function useLang() {
  return useContext(LangCtx)
}

/**
 * EN and ID side by side in the top-left corner, the current one full ink,
 * the other faded; in difference blend like the mute button so it reads on
 * every ground. One press swaps.
 */
export function LangToggle() {
  const { lang, copy, setLang } = useLang()
  const other: Lang = lang === 'en' ? 'id' : 'en'
  return (
    <button
      type="button"
      className="inv-fixed inv-lang"
      onClick={() => setLang(other)}
      aria-label={copy.chrome.switchTo}
      title={copy.chrome.switchTo}
    >
      <span className={lang === 'en' ? 'is-on' : undefined}>EN</span>
      <span className="inv-lang__sep" aria-hidden>
        /
      </span>
      <span className={lang === 'id' ? 'is-on' : undefined}>ID</span>
    </button>
  )
}
