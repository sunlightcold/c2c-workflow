import { IpProxyEntity, MerchantEntity } from '@admin/database'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'

export interface ProxyScope {
  tenantId: string
  merchantId: string
}

export function createProxyAgents(
  proxy: Pick<IpProxyEntity, 'protocol' | 'host' | 'port' | 'username'>,
  password: string,
) {
  const host = proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host
  const url = new URL(`${proxy.protocol}://${host}:${proxy.port}`)
  url.username = proxy.username
  url.password = password
  if (proxy.protocol.startsWith('socks')) {
    const agent = new SocksProxyAgent(url)
    return { httpAgent: agent, httpsAgent: agent, destroy: () => agent.destroy() }
  }
  const httpAgent = new HttpProxyAgent(url)
  const httpsAgent = new HttpsProxyAgent(url)
  return {
    httpAgent,
    httpsAgent,
    destroy: () => {
      httpAgent.destroy()
      httpsAgent.destroy()
    },
  }
}

@Injectable()
export class ProxyNetworkService {
  constructor(
    @InjectRepository(IpProxyEntity) private readonly proxies: Repository<IpProxyEntity>,
    @InjectRepository(MerchantEntity) private readonly merchants: Repository<MerchantEntity>,
    private readonly cipher: CredentialCipherService,
  ) {}

  async forMerchant(scope: ProxyScope) {
    const merchant = await this.merchants.findOne({
      where: { id: scope.merchantId, tenantId: scope.tenantId },
      select: { id: true, tenantId: true, proxyId: true },
    })
    if (!merchant) throw new BadRequestException('代理出口商家不存在')
    if (!merchant.proxyId) return null
    const proxy = await this.proxies.findOne({
      where: { id: merchant.proxyId, tenantId: scope.tenantId },
      select: {
        id: true,
        protocol: true,
        host: true,
        port: true,
        username: true,
        passwordRef: true,
        passwordConfigured: true,
        status: true,
        expiresAt: true,
      },
    })
    if (
      !proxy ||
      proxy.status !== 'active' ||
      (proxy.expiresAt && proxy.expiresAt.getTime() <= Date.now())
    )
      throw new BadRequestException('商家绑定的代理已停用或到期，请重新配置代理')
    return createProxyAgents(
      proxy,
      proxy.passwordConfigured ? this.cipher.decrypt(proxy.passwordRef) : '',
    )
  }
}
