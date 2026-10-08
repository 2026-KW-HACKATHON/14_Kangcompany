import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
const fixture = (name: string) =>
  fileURLToPath(new URL(`./tests/local/${name}`, import.meta.url))
export default defineConfig({
  plugins: [
    {
      name: 'isolated-local-fixtures',
      enforce: 'pre',
      resolveId(id) {
        if (/^(\.\.\/)+api$/.test(id)) return fixture('mock-api.ts')
        if (/^(\.\.\/)+lib\/supabase$/.test(id))
          return fixture('mock-supabase.ts')
      },
    },
  ],
  esbuild: { jsx: 'automatic' },
  define: {
    'import.meta.env.VITE_TOSS_CLIENT_KEY': JSON.stringify(
      'local-test-client-key',
    ),
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/local/*.test.ts*'],
    maxWorkers: 1,
    fileParallelism: false,
  },
})
