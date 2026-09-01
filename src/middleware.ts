import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * TEMPORARY, and the whole reason this branch exists.
 *
 * The approved WhatsApp template registers its button as
 * `https://www.sitafatan.wedding/{{1}}`. Changing that base means a new
 * template version and another 24-hour review at Meta, so during testing the
 * production host has to stay in the message and send the visitor onward
 * instead.
 *
 * Done in middleware rather than in the page so nothing reaches production's
 * database: a slug that only exists in staging would otherwise be looked up
 * here, come back empty, and 404 before the redirect could happen. It also
 * spares `generateMetadata` a lookup on every WhatsApp link preview.
 *
 * 307, never 308. A permanent redirect is cached by browsers and by link
 * preview fetchers, and would keep sending guests to staging long after this
 * branch is reverted.
 *
 * Revert by deleting this block. Nothing else on this branch differs from
 * master.
 */
const INVITATION_REDIRECT_HOST = 'https://staging.sitafatan.wedding'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/to/')) {
    const onward = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      INVITATION_REDIRECT_HOST
    )
    return NextResponse.redirect(onward, 307)
  }

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  await supabase.auth.getUser()
  return response
}

export const config = {
  // The metadata file routes (icon, apple-icon, opengraph-image,
  // twitter-image) are fetched by crawlers with no session at all. Running the
  // Supabase session refresh on them is a wasted round trip per fetch, and a
  // WhatsApp link preview would pay for it on every share.
  matcher: [
    '/((?!_next/static|_next/image|icon.png|apple-icon.png|opengraph-image.png|twitter-image.png|favicon.ico).*)',
  ],
}
