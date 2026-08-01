export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Check .env.local against .env.example.`)
  }
  return value
}
