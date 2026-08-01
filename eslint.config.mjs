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
  ]),
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@supabase/supabase-js', message: 'src/domain/ must stay pure — no supabase-js.' },
            { name: 'next', message: 'src/domain/ must stay pure — no next.' },
            { name: 'react', message: 'src/domain/ must stay pure — no react.' },
            { name: 'react-dom', message: 'src/domain/ must stay pure — no react-dom.' },
          ],
          patterns: [
            {
              group: ['next/*', '../server/*', '../../server/*', '**/src/server/*'],
              message: 'src/domain/ must stay pure — no src/server, no next.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
