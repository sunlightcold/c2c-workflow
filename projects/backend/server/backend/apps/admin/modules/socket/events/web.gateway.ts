import { IRequest } from '@/common/interfaces'
import { Inject, Logger, UseGuards } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { IJwtService } from '@/apps/admin/modules/system/auth'
import { EVENT_KEYS, GlobalEventMap } from '@admin/modules/event-emitter'
import { OnlineService } from 'apps/admin/modules/system'
import { getClientIp } from 'request-ip'
import { Server, Socket } from 'socket.io'
import { SocketEvents } from '../constants'
import { SocketAuthGuard } from '../guards'
import { gatewayMessageFormat } from '../response'

@UseGuards(SocketAuthGuard)
@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class WebEventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private static readonly DISCONNECT_GRACE_MS = 1500

  @WebSocketServer()
  server: Server

  tokenSocketIdMap = new Map<string, Set<string>>()
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>()

  @Inject(IJwtService) private readonly jwtService: IJwtService
  @Inject(OnlineService) private readonly onlineService: OnlineService

  private readonly logger = new Logger('WebEventsGateway')

  authFailed(client: Socket) {
    client.send(gatewayMessageFormat(SocketEvents.AUTH_FAILED, '认证失败'))
    client.disconnect()
  }

  authSuccess(client: Socket) {
    client.send(gatewayMessageFormat(SocketEvents.GATEWAY_CONNECT, 'WebSocket 已连接'))
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token as string
    if (!token || !(await this.jwtService.checkToken(token))) {
      return this.authFailed(client)
    }

    this.authSuccess(client)
    const id = client.id
    this.bindSocket(token, id)
  }

  @OnEvent(EVENT_KEYS.ADMIN_SESSION_REVOKED)
  handleAdminSessionRevoked(payload: GlobalEventMap[typeof EVENT_KEYS.ADMIN_SESSION_REVOKED]) {
    const socketIds = this.tokenSocketIdMap.get(payload.token)
    if (!socketIds) return

    for (const socketId of socketIds) {
      const socket = this.server.sockets.sockets.get(socketId)
      socket?.send(gatewayMessageFormat(SocketEvents.AUTH_FAILED, '登录会话已被下线'))
      socket?.disconnect(true)
    }
    this.tokenSocketIdMap.delete(payload.token)
  }

  handleDisconnect(client: Socket) {
    this.logger.log('disconnect WebSocket 已断开', client.id)
    const token = client.handshake.auth.token as string
    this.unbindSocket(token, client.id)
    this.scheduleDisconnected(token)
    client.send(gatewayMessageFormat(SocketEvents.GATEWAY_DISCONNECT, 'WebSocket 已断开'))
  }

  // @SubscribeMessage('events')
  // findAll(): Observable<WsResponse<number>> {
  //   return from([1, 2, 3]).pipe(map((item) => ({ event: 'events', data: item })))
  // }

  @SubscribeMessage('online')
  online(@ConnectedSocket() client: Socket) {
    this.recordSessionClient(client)
  }

  @SubscribeMessage('admin.session.client.ready')
  recordSessionClient(@ConnectedSocket() client: Socket) {
    const token = client.handshake.auth.token as string
    const request = client.request as IRequest
    const ip = getClientIp(request) ?? ''
    const agent = request.headers['user-agent'] ?? ''
    this.onlineService.recordSessionClient(token, agent, ip)
  }

  @SubscribeMessage('offline')
  offline() {}

  @SubscribeMessage('identity')
  identity(@MessageBody() data: number) {
    return data
  }

  private bindSocket(token: string, socketId: string) {
    this.cancelDisconnectTimer(token)
    const socketIds = this.tokenSocketIdMap.get(token) ?? new Set<string>()
    socketIds.add(socketId)
    this.tokenSocketIdMap.set(token, socketIds)
  }

  private unbindSocket(token: string, socketId: string) {
    const socketIds = this.tokenSocketIdMap.get(token)
    if (!socketIds) return

    socketIds.delete(socketId)
    if (socketIds.size === 0) {
      this.tokenSocketIdMap.delete(token)
    }
  }

  private scheduleDisconnected(token: string) {
    if (this.tokenSocketIdMap.has(token)) return

    this.cancelDisconnectTimer(token)
    const timer = setTimeout(() => {
      if (!this.tokenSocketIdMap.has(token)) {
        this.onlineService
          .markSessionDisconnected(token)
          .catch((error) =>
            this.logger.warn(`标记 Token 会话离线失败: ${(error as Error).message}`),
          )
      }
      this.disconnectTimers.delete(token)
    }, WebEventsGateway.DISCONNECT_GRACE_MS)
    this.disconnectTimers.set(token, timer)
  }

  private cancelDisconnectTimer(token: string) {
    const timer = this.disconnectTimers.get(token)
    if (!timer) return

    clearTimeout(timer)
    this.disconnectTimers.delete(token)
  }
}
