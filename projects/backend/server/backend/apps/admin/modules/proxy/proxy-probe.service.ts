import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { IpProxyEntity } from '@admin/database'
import { Repository } from 'typeorm'
import axios from 'axios'
import { isIP } from 'node:net'
import type { Readable } from 'node:stream'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'
import { ProxyService } from './proxy.service'
import { createProxyAgents } from './proxy-network.service'

export interface TestResult {
  success: boolean
  message: string
  latency_ms?: number
  ip_address?: string
  country?: string
  country_code?: string
  city?: string
  region?: string
}
export interface QualityItem {
  target: string
  status: 'pass' | 'warn' | 'fail' | 'challenge'
  message: string
  latency_ms?: number
  http_status?: number
  cf_ray?: string
}

// These fixed targets/statuses and scoring match sub2api's admin_proxy.go.
const targets = [
  { target: 'openai', url: 'https://api.openai.com/v1/models', allowed: [401] },
  {
    target: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    allowed: [401, 405, 404, 400],
  },
  {
    target: 'gemini',
    url: 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta',
    allowed: [200],
  },
  { target: 'grok', url: 'https://api.x.ai/v1/models', allowed: [401] },
]

export function summarizeProxyQuality(items: QualityItem[]) {
  const count = (status: string) => items.filter((item) => item.status === status).length
  const passed_count = count('pass')
  const warn_count = count('warn')
  const failed_count = count('fail')
  const challenge_count = count('challenge')
  const score = Math.max(0, 100 - warn_count * 10 - failed_count * 22 - challenge_count * 30)
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    passed_count,
    warn_count,
    failed_count,
    challenge_count,
    summary: `通过 ${passed_count} 项，告警 ${warn_count} 项，失败 ${failed_count} 项，挑战 ${challenge_count} 项`,
  }
}

@Injectable()
export class ProxyProbeService {
  private readonly pending = new Map<string, { tenantId: string; id: string }>()
  private workers = 0
  private stopping = false
  constructor(
    private readonly proxies: ProxyService,
    private readonly cipher: CredentialCipherService,
    @InjectRepository(IpProxyEntity) private readonly repository: Repository<IpProxyEntity>,
  ) {}

  @OnEvent('ip-proxy.probe')
  enqueue(input: { tenantId: string; id: string }) {
    if (this.stopping) return
    this.pending.set(`${input.tenantId}:${input.id}`, input)
    if (this.workers < 5) {
      this.workers++
      this.drain().catch(() => undefined)
    }
  }

  onApplicationShutdown() {
    this.stopping = true
    this.pending.clear()
  }

  async test(tenantId: string, id: string) {
    const entity = await this.proxies.get(tenantId, id, true)
    const result = await this.probe(entity)
    await this.repository.update(
      { tenantId, id, fingerprint: entity.fingerprint },
      { lastTest: { ...result, checked_at: Math.floor(Date.now() / 1000) } },
    )
    return result
  }

  async quality(tenantId: string, id: string) {
    const entity = await this.proxies.get(tenantId, id, true)
    const base = await this.probe(entity)
    const items: QualityItem[] = [
      {
        target: 'base_connectivity',
        status: base.success ? 'pass' : 'fail',
        message: base.message,
        latency_ms: base.latency_ms,
      },
    ]
    if (base.success) {
      const agents = createProxyAgents(
        entity,
        entity.passwordConfigured ? this.cipher.decrypt(entity.passwordRef) : '',
      )
      try {
        for (const target of targets) {
          const started = Date.now()
          try {
            const response = await axios.get<Readable>(target.url, {
              httpAgent: agents.httpAgent,
              httpsAgent: agents.httpsAgent,
              proxy: false,
              timeout: 15000,
              maxRedirects: 0,
              validateStatus: () => true,
              responseType: 'stream',
              headers: {
                Accept: 'application/json,text/html,*/*',
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
              },
            })
            const body = await this.readQualityBody(response.data)
            const challenge =
              response.headers['cf-mitigated'] === 'challenge' ||
              ([403, 503].includes(response.status) &&
                /cf-chl-|challenge-platform|Just a moment/i.test(body))
            const status = challenge
              ? 'challenge'
              : target.allowed.includes(response.status)
                ? 'pass'
                : response.status === 429
                  ? 'warn'
                  : 'fail'
            items.push({
              target: target.target,
              status,
              latency_ms: Date.now() - started,
              http_status: response.status,
              message: challenge ? '命中 Cloudflare challenge' : `HTTP ${response.status}`,
              ...(challenge
                ? { cf_ray: String(response.headers['cf-ray'] ?? '').slice(0, 128) }
                : {}),
            })
          } catch {
            items.push({
              target: target.target,
              status: 'fail',
              latency_ms: Date.now() - started,
              message: '代理请求失败或超时',
            })
          }
        }
      } finally {
        agents.destroy()
      }
    }
    const result = {
      proxy_id: id,
      ...summarizeProxyQuality(items),
      checked_at: Math.floor(Date.now() / 1000),
      exit_ip: base.ip_address,
      country: base.country,
      country_code: base.country_code,
      base_latency_ms: base.latency_ms,
      items,
    }
    await this.repository.update(
      { tenantId, id, fingerprint: entity.fingerprint },
      { lastTest: { ...base }, lastQuality: result },
    )
    return result
  }

  private async probe(entity: IpProxyEntity): Promise<TestResult> {
    const agents = createProxyAgents(
      entity,
      entity.passwordConfigured ? this.cipher.decrypt(entity.passwordRef) : '',
    )
    try {
      for (const [url, ipField] of [
        ['http://ip-api.com/json/?lang=zh-CN', 'query'],
        ['http://api64.ipify.org?format=json', 'ip'],
      ]) {
        const started = Date.now()
        try {
          const { data, status } = await axios.get<Record<string, unknown>>(url, {
            httpAgent: agents.httpAgent,
            httpsAgent: agents.httpsAgent,
            proxy: false,
            timeout: 10000,
            maxContentLength: 1024 * 1024,
            maxRedirects: 0,
          })
          if (
            status !== 200 ||
            (ipField === 'query' && String(data.status).toLowerCase() !== 'success')
          )
            continue
          const ip = data[ipField]
          if (typeof ip !== 'string' || !isIP(ip)) continue
          const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 128) : '')
          return {
            success: true,
            message: '代理连接正常',
            latency_ms: Date.now() - started,
            ip_address: ip,
            country: text(data.country),
            country_code: text(data.countryCode),
            city: text(data.city),
            region: text(data.regionName) || text(data.region),
          }
        } catch {
          /* Try the same secondary fixed probe as upstream; never direct. */
        }
      }
      return { success: false, message: '代理连接失败，请检查地址、认证和网络' }
    } finally {
      agents.destroy()
    }
  }

  private async drain() {
    try {
      while (!this.stopping && this.pending.size) {
        const entry = this.pending.entries().next().value
        if (!entry) break
        const [key, input] = entry
        this.pending.delete(key)
        try {
          await this.test(input.tenantId, input.id)
        } catch {
          /* A deleted/edited proxy must not stop other probes. */
        }
      }
    } finally {
      this.workers--
    }
  }

  private async readQualityBody(stream: Readable): Promise<string> {
    const chunks: Buffer[] = []
    let length = 0
    try {
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        chunks.push(buffer.subarray(0, Math.max(0, 8192 - length)))
        length += buffer.length
        if (length >= 8192) break
      }
      return Buffer.concat(chunks).toString('utf8')
    } finally {
      stream.destroy()
    }
  }
}
