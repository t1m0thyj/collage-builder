import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // Konva is needed immediately by the editor. Keep it eager, but give
              // the stable rendering engine its own cacheable chunk.
              name: 'canvas-vendor',
              test: /node_modules[\\/]konva[\\/]/,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
})
