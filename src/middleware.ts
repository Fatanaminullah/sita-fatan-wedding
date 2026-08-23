import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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
  //
  // api/whatsapp is excluded for the same reason and one more: Meta calls it
  // with no cookies, and counts a slow 200 against the endpoint the way it
  // counts an error. A Supabase round trip that can only ever return "no
  // session" is latency spent on every guest message and every delivery
  // receipt.
  matcher: [
    '/((?!_next/static|_next/image|api/whatsapp|icon.png|apple-icon.png|opengraph-image.png|twitter-image.png|favicon.ico).*)',
  ],
}
