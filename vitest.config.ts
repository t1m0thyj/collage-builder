import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // Transform Zod through Vite to avoid Bun's external ESM interop in Vitest.
    server: { deps: { inline: ['zod'] } },
  },
})
