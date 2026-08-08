import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // The planner domain resolves instants (e.g. toDayKey) using host-local
    // Date methods, and this product is single-timezone Asia/Jakarta, so the
    // test runner is pinned here rather than making every test offset-aware.
    env: { TZ: 'Asia/Jakarta' },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // tests/rls/** hit the real, live Supabase project (no local stack) —
    // the default 5s timeout is too tight for network round trips under load
    testTimeout: 20000,
    // Running all test files in parallel means multiple RLS suites hit the
    // same live project at once, causing intermittent contention failures.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
