import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@mock/core': resolve(__dirname, 'server/core'),
      '@mock/upstreams': resolve(__dirname, 'server/upstreams'),
    },
  },
})
