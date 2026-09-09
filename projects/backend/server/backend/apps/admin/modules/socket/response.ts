import type { SocketEvents } from './constants'

export function gatewayMessageFormat(type: SocketEvents, message: any, code?: number) {
  return { type, msg: message, code }
}
