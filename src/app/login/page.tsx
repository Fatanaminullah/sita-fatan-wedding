import { signIn } from '@/server/actions/auth-actions'

export default function LoginPage() {
  async function action(formData: FormData) {
    'use server'
    await signIn(formData)
  }

  return (
    <main className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">Sign in</h1>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Sign in
        </button>
      </form>
    </main>
  )
}
