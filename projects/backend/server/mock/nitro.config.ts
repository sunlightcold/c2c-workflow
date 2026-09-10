import { resolve } from 'node:path'

export default defineNitroConfig({
  srcDir: 'server',
  compatibilityDate: '2026-08-20',
  alias: {
    '@mock/core': resolve('./server/core'),
    '@mock/upstreams': resolve('./server/upstreams'),
  },
})
