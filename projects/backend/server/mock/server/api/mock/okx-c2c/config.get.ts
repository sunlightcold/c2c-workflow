import { getOkxC2cState } from '@mock/upstreams/okx-c2c/state'

export default defineEventHandler((event) => ({
  plugin: 'okx-c2c',
  gateway: getRequestURL(event).origin,
  settings: getOkxC2cState().getSettings(),
}))
