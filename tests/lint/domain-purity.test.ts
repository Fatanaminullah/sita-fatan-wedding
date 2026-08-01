import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'

async function lintFixture(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(code, { filePath })
  return result
}

describe('domain purity lint rule', () => {
  it('flags supabase-js imports inside src/domain', async () => {
    const result = await lintFixture(
      'src/domain/__fixture_supabase_import.ts',
      `import { createClient } from '@supabase/supabase-js'\nexport const x = createClient\n`
    )
    const ruleIds = result.messages.map((m) => m.ruleId)
    expect(ruleIds).toContain('no-restricted-imports')
  })

  it('flags src/server imports inside src/domain', async () => {
    const result = await lintFixture(
      'src/domain/__fixture_server_import.ts',
      `import { loadState } from '../server/repositories/guests-repository'\nexport const x = loadState\n`
    )
    const ruleIds = result.messages.map((m) => m.ruleId)
    expect(ruleIds).toContain('no-restricted-imports')
  })

  it('allows plain TypeScript imports inside src/domain', async () => {
    const result = await lintFixture(
      'src/domain/__fixture_clean.ts',
      `export function add(a: number, b: number) { return a + b }\n`
    )
    const ruleIds = result.messages.map((m) => m.ruleId)
    expect(ruleIds).not.toContain('no-restricted-imports')
  })
})
