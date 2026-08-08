import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored superpowers skills: third-party MIT source, not this project's
    // code to lint. Without this, `npm run lint` reports 175 problems from
    // .claude/skills/** and a real error in src/ is lost in the noise.
    ".claude/**",
  ]),
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@supabase/supabase-js', message: 'src/domain/ must stay pure — no supabase-js.' },
            { name: '@supabase/ssr', message: 'src/domain/ must stay pure — no supabase ssr client.' },
            { name: 'next', message: 'src/domain/ must stay pure — no next.' },
            { name: 'react', message: 'src/domain/ must stay pure — no react.' },
            { name: 'react-dom', message: 'src/domain/ must stay pure — no react-dom.' },
          ],
          patterns: [
            {
              // `@/server/**` is the alias form every other file in this repo
              // actually uses; the relative forms are here for completeness.
              group: [
                'next/*',
                '@/server',
                '@/server/**',
                '../server/*',
                '../../server/*',
                '**/src/server/*',
              ],
              message: 'src/domain/ must stay pure — no src/server, no next.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
