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
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
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

  const value = useMemo(() => ({ lang, copy: COPY[lang], setLang }), [lang, setLang])
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
