import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import Ws from 'ws'
import { BinanceC2cClient, type BinanceCredentials } from '../c2c-platform/binance-c2c.client'
import { ProxyNetworkService } from '../proxy/proxy-network.service'
import {
  chatRecord,
  normalizeChatMessage,
  parseChatJson,
  unwrapChatItems,
} from './binance-chat.protocol'
import { ChatError, type ChatInbound, type ChatSendStatus } from './chat.types'

export interface BinanceChatConnection {
  ready: () => boolean
  close: () => void
  send: (orderNo: string, payload: Record<string, unknown>) => Promise<ChatSendStatus>
}
export function requireBinanceChatUrl(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== 'wss:' ||
    url.hostname !== 'im.binance.com' ||
    (url.port && url.port !== '443') ||
    url.pathname !== '/chat' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '平台聊天连接地址不受支持')
  return url
}
@Injectable()
export class BinanceChatAdapter {
  constructor(
    private readonly client: BinanceC2cClient,
    private readonly network: ProxyNetworkService,
  ) {}
  async messages(
    credentials: BinanceCredentials,
    orderNo: string,
    active: () => boolean,
  ): Promise<ChatInbound[]> {
    const result: ChatInbound[] = []
    for (let page = 1; page <= 20; page++) {
      if (!active()) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
      const response = await this.client.chatRequest<unknown>(
        credentials,
        '/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination',
        { orderNo, page: String(page), rows: '100' },
      )
      if (!active()) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
      const items = unwrapChatItems(response.data).filter((item) => Object.keys(item).length)
      for (const item of items) {
        const message = normalizeChatMessage(item, orderNo)
        if (message) result.push(message)
      }
      if (items.length < 100 || (response.total !== undefined && page * 100 >= response.total))
        return result
    }
    throw new ChatError('CHAT_BACKLOG_LIMIT', '平台聊天积压超出当前处理窗口')
  }
  async imageUpload(credentials: BinanceCredentials, imageName: string) {
    const response = await this.client.chatRequest<{ preSignedUrl: string; imageUrl: string }>(
      credentials,
      '/sapi/v1/c2c/chat/image/pre-signed-url',
      {},
      { imageName },
    )
    if (!response.data?.preSignedUrl || !response.data.imageUrl)
      throw new ChatError('CHAT_ATTACHMENT_UPLOAD_FAILED', '平台图片上传凭据无效', 502)
    return response.data
  }
  async connect(
    credentials: BinanceCredentials,
    callbacks: {
      active: () => boolean
      message: (input: ChatInbound) => void
      unread: () => void
      opened: () => void
      closed: () => void
      invalid: () => void
    },
  ): Promise<BinanceChatConnection> {
    const response = await this.client.chatRequest<{
      chatWssUrl: string
      listenKey: string
      listenToken: string
    }>(credentials, '/sapi/v1/c2c/chat/retrieveChatCredential')
    if (!callbacks.active()) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
    const chat = response.data
    if (!chat?.listenKey || !chat.listenToken || !chat.chatWssUrl)
      throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '平台聊天凭据无效')
    const url = requireBinanceChatUrl(chat.chatWssUrl)
    url.pathname += `/${encodeURIComponent(chat.listenKey)}`
    url.searchParams.set('token', chat.listenToken)
    url.searchParams.set('clientType', 'web')
    const agents = credentials.proxyScope
      ? await this.network.forMerchant(credentials.proxyScope)
      : null
    if (!callbacks.active()) {
      agents?.destroy()
      throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
    }
    let socket: Ws
    try {
      socket = new Ws(url, {
        agent: agents?.httpsAgent,
        handshakeTimeout: credentials.timeoutMs,
        maxPayload: 1024 * 1024,
        followRedirects: false,
      })
    } catch {
      agents?.destroy()
      throw new ChatError('CHAT_SOCKET_UNAVAILABLE', '平台聊天连接失败', 502)
    }
    const pending = new Map<
      string,
      {
        orderNo: string
        type: unknown
        content: unknown
        imageUrl: unknown
        resolve: (status: ChatSendStatus) => void
        timer: NodeJS.Timeout
      }
    >()
    let closed = false
    let heartbeat: NodeJS.Timeout | undefined
    let pongTimeout: NodeJS.Timeout | undefined
    const refresh = setTimeout(() => socket.terminate(), 6 * 60 * 60 * 1000)
    refresh.unref()
    const cleanup = () => {
      if (closed) return
      closed = true
      clearTimeout(refresh)
      clearInterval(heartbeat)
      clearTimeout(pongTimeout)
      for (const item of pending.values()) {
        clearTimeout(item.timer)
        item.resolve('UNKNOWN')
      }
      pending.clear()
      agents?.destroy()
      callbacks.closed()
    }
    socket.on('error', () => {
      socket.terminate()
      cleanup()
    })
    socket.once('close', cleanup)
    socket.on('pong', () => {
      clearTimeout(pongTimeout)
      pongTimeout = undefined
    })
    socket.once('open', () => {
      if (closed) return
      callbacks.opened()
      heartbeat = setInterval(() => {
        if (socket.readyState !== Ws.OPEN) return
        socket.ping()
        pongTimeout = setTimeout(() => socket.terminate(), 10_000)
        pongTimeout.unref()
      }, 30_000)
      heartbeat.unref()
    })
    socket.on('message', (data) => {
      try {
        const parsed = parseChatJson(data.toString())
        const control = chatRecord(parsed)
        if (control.type === 'statistics' && control.subType === 'unreadIntegratedChatCount') {
          if (Number(control.totalCount) > 0) callbacks.unread()
          return
        }
        for (const item of unwrapChatItems(parsed)) {
          try {
            const message = normalizeChatMessage(item)
            if (!message) continue
            const outgoing = message.uuid ? pending.get(message.uuid) : undefined
            if (
              outgoing &&
              message.origin === 'SELF' &&
              outgoing.orderNo === message.orderNo &&
              String(outgoing.type).toUpperCase() === message.type &&
              (message.type === 'TEXT'
                ? outgoing.content === message.text
                : outgoing.imageUrl === message.imageUrl)
            ) {
              clearTimeout(outgoing.timer)
              pending.delete(message.uuid!)
              outgoing.resolve('SENT')
            }
            callbacks.message(message)
          } catch {
            callbacks.invalid()
          }
        }
      } catch {
        callbacks.invalid()
      }
    })
    return {
      ready: () => !closed && socket.readyState === Ws.OPEN,
      close: () => {
        socket.terminate()
        cleanup()
      },
      send: (orderNo, payload) => {
        if (closed || socket.readyState !== Ws.OPEN)
          throw new ChatError('CHAT_SOCKET_UNAVAILABLE', '平台聊天未连接')
        if (pending.size >= 4)
          throw new ChatError('CHAT_SEND_BUSY', '当前商家发送处理中，请稍后重试', 429)
        return new Promise<ChatSendStatus>((resolve) => {
          const uuid = randomUUID()
          const timer = setTimeout(() => {
            pending.delete(uuid)
            resolve('UNKNOWN')
          }, 10_000)
          timer.unref()
          pending.set(uuid, {
            orderNo,
            type: payload.type,
            content: payload.content,
            imageUrl: payload.imageUrl,
            resolve,
            timer,
          })
          const unknown = () => {
            if (pending.delete(uuid)) {
              clearTimeout(timer)
              resolve('UNKNOWN')
            }
          }
          try {
            socket.send(
              JSON.stringify({
                ...payload,
                uuid,
                orderNo,
                createTime: Date.now(),
                ...(payload.type === 'text'
                  ? { self: true, clientType: 'web', sendStatus: 0 }
                  : {}),
              }),
              (error) => {
                if (!error) return
                unknown()
              },
            )
          } catch {
            unknown()
          }
        })
      },
    }
  }
}
