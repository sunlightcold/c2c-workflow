import { IpProxyEntity, MerchantEntity, TenantEntity } from '@admin/database'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { DataSource } from 'typeorm'

// Port of sub2api/internal/service/proxy_fallback.go. Only expiry triggers rerouting.
export type ProxyFallbackNode = Pick<
  IpProxyEntity,
  'id' | 'fallbackMode' | 'backupProxyId' | 'status' | 'expiresAt'
>
export function resolveProxyFallback(
  start: ProxyFallbackNode,
  byId: Map<string, ProxyFallbackNode>,
  now: number,
): string | null | undefined {
  let current = start
  const visited = new Set([start.id])
  for (;;) {
    if (current.fallbackMode === 'direct') return null
    if (
      current.fallbackMode !== 'proxy' ||
      !current.backupProxyId ||
      visited.has(current.backupProxyId)
    )
      return undefined
    const backup = byId.get(current.backupProxyId)
    if (!backup) return undefined
    if (backup.status === 'active' && (!backup.expiresAt || backup.expiresAt.getTime() > now))
      return backup.id
    visited.add(backup.id)
    current = backup
  }
}

@Injectable()
export class ProxyExpiryService {
  private readonly logger = new Logger(ProxyExpiryService.name)
  private running = false
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.sweep()
  }

  @Interval(60_000)
  async sweep() {
    if (this.running) return
    this.running = true
    try {
      // System sweep enumerates tenant identities; every business read/write below is scoped.
      const tenants = await this.dataSource
        .getRepository(TenantEntity)
        .find({ select: { id: true } })
      for (const tenant of tenants) await this.sweepTenant(tenant.id)
    } catch {
      this.logger.error('代理到期策略执行失败，将在下一次扫描重试')
    } finally {
      this.running = false
    }
  }

  async sweepTenant(tenantId: string) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `ip-proxy-expiry:${tenantId}`,
      ])
      const proxies = await manager.find(IpProxyEntity, {
        where: { tenantId },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      })
      const byId = new Map(proxies.map((proxy) => [proxy.id, proxy]))
      const now = Date.now()
      for (const proxy of proxies) {
        if (proxy.status !== 'active' || !proxy.expiresAt || proxy.expiresAt.getTime() > now)
          continue
        const target = resolveProxyFallback(proxy, byId, now)
        if (target === undefined) continue
        await manager.update(MerchantEntity, { tenantId, proxyId: proxy.id }, { proxyId: target })
      }
    })
  }
}
