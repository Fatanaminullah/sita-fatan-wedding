import { redirect } from 'next/navigation'

// Internal tool: there is no public landing page. `/` goes straight to the
// dashboard, which redirects to /login when there's no session.
export default function Home() {
  redirect('/dashboard')
}
