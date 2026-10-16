import { IpProxyEntity, MerchantEntity } from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { createHmac } from 'node:crypto'
import { DataSource, Repository } from 'typeorm'
import { getConfig } from '@/common/utils/config'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'
import { ProxyFieldsDto, type ProxyListDto, type UpdateProxyDto } from './proxy.dto'
import { validateSync } from 'class-validator'

export interface ProxyImportResult {
  proxy_created: number
  proxy_reused: number
  proxy_failed: number
  account_created: number
  account_failed: number
  errors: Array<{ kind: string; name: string; message: string }>
}

@Injectable()
export class ProxyService {
  constructor(
    @InjectRepository(IpProxyEntity) private readonly repository: Repository<IpProxyEntity>,
    @InjectRepository(MerchantEntity) private readonly merchants: Repository<MerchantEntity>,
    private readonly dataSource: DataSource,
    private readonly cipher: CredentialCipherService,
    private readonly events: EventEmitter2,
  ) {}

  async list(tenantId: string, input: ProxyListDto) {
    const query = this.query(tenantId, input)
    const total = await query.getCount()
    const { entities, raw } = await query
      .skip((input.page - 1) * input.page_size)
      .take(input.page_size)
      .getRawAndEntities()
    return {
      items: entities.map((entity, index) => this.view(entity, Number(raw[index].account_count))),
      total,
      page: input.page,
      page_size: input.page_size,
      pages: Math.ceil(total / input.page_size),
    }
  }

  async all(tenantId: string) {
    const { entities, raw } = await this.query(tenantId, { status: 'active' }).getRawAndEntities()
    return entities.map((entity, index) => this.view(entity, Number(raw[index].account_count)))
  }

  view(entity: IpProxyEntity, accountCount = 0) {
    return {
      id: entity.id,
      name: entity.name,
      protocol: entity.protocol,
      host: entity.host,
      port: entity.port,
      username: entity.username,
      password_configured: entity.passwordConfigured,
      status:
        entity.expiresAt && entity.expiresAt.getTime() <= Date.now() ? 'expired' : entity.status,
      expires_at: entity.expiresAt ? Math.floor(entity.expiresAt.getTime() / 1000) : null,
      expiry_warn_days: entity.expiryWarnDays,
      fallback_mode: entity.fallbackMode,
      backup_proxy_id: entity.backupProxyId,
      account_count: accountCount,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      last_test: entity.lastTest,
      last_quality: entity.lastQuality,
    }
  }

  async get(tenantId: string, id: string, secret = false) {
    const query = this.repository
      .createQueryBuilder('proxy')
      .where('proxy.tenantId = :tenantId AND proxy.id = :id', { tenantId, id })
    if (secret)
      query.addSelect(['proxy.passwordRef', 'proxy.fingerprint', 'proxy.batchFingerprint'])
    const entity = await query.getOne()
    if (!entity) throw new NotFoundException('代理不存在')
    return entity
  }

  async create(tenantId: string, input: ProxyFieldsDto) {
    const value = this.normalize(input)
    await this.validateBackup(tenantId, value)
    const saved = await this.save(this.repository.create({ tenantId, ...this.entityFields(value) }))
    this.events.emit('ip-proxy.probe', { tenantId, id: saved.id })
    return saved
  }

  async update(tenantId: string, id: string, input: UpdateProxyDto) {
    const entity = await this.get(tenantId, id, true)
    const value = this.normalize({
      name: entity.name,
      protocol: entity.protocol,
      host: entity.host,
      port: entity.port,
      username: entity.username,
      password: entity.passwordConfigured ? this.cipher.decrypt(entity.passwordRef) : '',
      status: entity.status,
      expires_at: entity.expiresAt ? Math.floor(entity.expiresAt.getTime() / 1000) : null,
      expiry_warn_days: entity.expiryWarnDays,
      fallback_mode: entity.fallbackMode,
      backup_proxy_id: entity.backupProxyId,
      ...input,
    })
    await this.validateBackup(tenantId, value, id)
    const result = await this.save(Object.assign(entity, this.entityFields(value)))
    this.events.emit('merchant-chat.configuration-changed', { tenantId })
    return result
  }

  async batch(tenantId: string, inputs: ProxyFieldsDto[]) {
    let created = 0
    let skipped = 0
    for (const input of inputs) {
      const value = this.normalize({ ...input, name: 'default' })
      const { batchFingerprint } = this.fingerprints(value)
      if (await this.repository.existsBy({ tenantId, batchFingerprint })) {
        skipped++
        continue
      }
      try {
        await this.create(tenantId, value)
        created++
      } catch (error) {
        if (error instanceof ConflictException) skipped++
        else throw error
      }
    }
    return { created, skipped }
  }

  async importData(tenantId: string, data: Record<string, unknown>): Promise<ProxyImportResult> {
    if (
      (data.type && !['sub2api-data', 'sub2api-bundle'].includes(String(data.type))) ||
      (data.version && data.version !== 1) ||
      !Array.isArray(data.proxies) ||
      !Array.isArray(data.accounts)
    )
      throw new BadRequestException('JSON 数据类型、版本或 proxies/accounts 数组无效')
    const result: ProxyImportResult = {
      proxy_created: 0,
      proxy_reused: 0,
      proxy_failed: 0,
      account_created: 0,
      account_failed: 0,
      errors: [],
    }
    for (const [index, raw] of data.proxies.entries()) {
      try {
        const value = this.importItem(raw)
        await this.resolveImportedBackup(
          tenantId,
          raw as Record<string, unknown>,
          value,
          result,
          index,
        )
        const { fingerprint } = this.fingerprints(value)
        const existing = await this.repository.findOneBy({ tenantId, fingerprint })
        if (existing) {
          if (existing.status !== value.status)
            await this.update(tenantId, existing.id, {
              status: value.status,
              expires_at: value.expires_at ?? null,
              expiry_warn_days: value.expiry_warn_days ?? 0,
              fallback_mode: value.fallback_mode ?? 'none',
              backup_proxy_id: value.backup_proxy_id ?? null,
            })
          result.proxy_reused++
          this.events.emit('ip-proxy.probe', { tenantId, id: existing.id })
        } else {
          try {
            await this.create(tenantId, value)
            result.proxy_created++
          } catch (error) {
            if (error instanceof ConflictException) result.proxy_reused++
            else throw error
          }
        }
      } catch (error) {
        result.proxy_failed++
        result.errors.push({
          kind: 'proxy',
          name: `第 ${index + 1} 条`,
          message: error instanceof BadRequestException ? error.message : '代理保存失败，请重试',
        })
      }
    }
    return result
  }

  async exportData(tenantId: string, input: ProxyListDto) {
    const proxies = await this.query(tenantId, input).getMany()
    const names = new Map(
      (await this.repository.find({ where: { tenantId }, select: { id: true, name: true } })).map(
        (p) => [p.id, p.name],
      ),
    )
    return {
      exported_at: new Date().toISOString(),
      proxies: proxies.map((p) => ({
        proxy_key: [p.protocol, p.host, p.port, p.username, ''].join('|'),
        name: p.name,
        protocol: p.protocol,
        host: p.host,
        port: p.port,
        username: p.username,
        status: p.status,
        expires_at: p.expiresAt ? Math.floor(p.expiresAt.getTime() / 1000) : null,
        expiry_warn_days: p.expiryWarnDays,
        fallback_mode: p.fallbackMode,
        ...(p.backupProxyId ? { backup_proxy_name: names.get(p.backupProxyId) } : {}),
      })),
      accounts: [],
    }
  }

  async accounts(tenantId: string, id: string) {
    await this.get(tenantId, id)
    return this.merchants.find({
      where: { tenantId, proxyId: id },
      select: { id: true, name: true, platform: true, status: true },
    })
  }

  async bind(tenantId: string, merchantId: string, proxyId: string | null) {
    const result = await this.dataSource.transaction(async (manager) => {
      if (proxyId) {
        const proxy = await manager.findOne(IpProxyEntity, {
          where: { id: proxyId, tenantId },
          lock: { mode: 'pessimistic_read' },
        })
        if (
          !proxy ||
          proxy.status !== 'active' ||
          (proxy.expiresAt && proxy.expiresAt.getTime() <= Date.now())
        )
          throw new BadRequestException('只能绑定同所属单位的启用、未到期代理')
      }
      const result = await manager.update(MerchantEntity, { id: merchantId, tenantId }, { proxyId })
      if (!result.affected) throw new NotFoundException('商家不存在')
      return { merchantId, proxyId }
    })
    this.events.emit('merchant-chat.configuration-changed', { tenantId, merchantId })
    return result
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id)
    try {
      const result = await this.repository.delete({ tenantId, id })
      if (!result.affected) throw new NotFoundException('代理不存在')
    } catch (error) {
      if ((error as { code?: string }).code === '23503')
        throw new ConflictException('代理已被商家或备用策略引用，请先解除引用')
      throw error
    }
    return { id }
  }

  async removeMany(tenantId: string, ids: string[]) {
    const deleted_ids: string[] = []
    const failed: Array<{ id: string; reason: string }> = []
    for (const id of ids) {
      try {
        await this.remove(tenantId, id)
        deleted_ids.push(id)
      } catch {
        failed.push({ id, reason: '代理不存在或已绑定商家，请先解绑' })
      }
    }
    return { deleted_ids, failed }
  }

  private importItem(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException('代理条目无效')
    const item = raw as Record<string, unknown>
    for (const key of ['protocol', 'host', 'name', 'username', 'password', 'status'])
      if (item[key] !== undefined && typeof item[key] !== 'string')
        throw new BadRequestException('代理字段类型无效')
    const status = String(item.status ?? '')
      .trim()
      .toLowerCase()
    return this.normalize({
      name: String(item.name ?? ''),
      protocol: item.protocol as ProxyFieldsDto['protocol'],
      host: item.host as string,
      port: item.port as number,
      username: item.username as string | undefined,
      password: item.password as string | undefined,
      status: (['disabled', 'expired'].includes(status)
        ? 'inactive'
        : status || 'active') as ProxyFieldsDto['status'],
      expires_at: item.expires_at as number | null | undefined,
      expiry_warn_days: item.expiry_warn_days as number | undefined,
      fallback_mode: (item.fallback_mode || 'none') as ProxyFieldsDto['fallback_mode'],
      backup_proxy_id: null,
    })
  }

  private query(tenantId: string, input: Partial<ProxyListDto>) {
    const query = this.repository
      .createQueryBuilder('proxy')
      .where('proxy.tenantId = :tenantId', { tenantId })
    if (input.protocol) query.andWhere('proxy.protocol = :protocol', { protocol: input.protocol })
    if (input.search?.trim())
      query.andWhere('(proxy.name ILIKE :search OR proxy.host ILIKE :search)', {
        search: `%${input.search.trim()}%`,
      })
    if (input.status === 'expired') query.andWhere('proxy.expiresAt <= :now', { now: new Date() })
    else if (input.status) {
      query.andWhere('proxy.status = :status', { status: input.status })
      query.andWhere('(proxy.expiresAt IS NULL OR proxy.expiresAt > :now)', { now: new Date() })
    }
    if (input.ids) {
      const ids = input.ids.split(',').filter(Boolean)
      if (
        !ids.length ||
        ids.length > 1000 ||
        ids.some((id) => !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))
      )
        throw new BadRequestException('代理 ID 无效')
      query.andWhere('proxy.id IN (:...ids)', { ids })
    }
    query.addSelect(
      (sub) =>
        sub
          .select('count(*)')
          .from(MerchantEntity, 'merchant')
          .where('merchant.tenantId = proxy.tenantId AND merchant.proxyId = proxy.id'),
      'account_count',
    )
    const sorts: Record<string, string> = {
      id: 'proxy.createdAt',
      name: 'proxy.name',
      protocol: 'proxy.protocol',
      status: 'proxy.status',
      created_at: 'proxy.createdAt',
      expiry: 'proxy.expiresAt',
      account_count: 'account_count',
    }
    return query
      .orderBy(
        sorts[input.sort_by ?? 'id'] ?? 'proxy.createdAt',
        input.sort_order === 'asc' ? 'ASC' : 'DESC',
        'NULLS LAST',
      )
      .addOrderBy('proxy.id', 'DESC')
  }

  private entityFields(value: ProxyFieldsDto) {
    return {
      name: value.name,
      protocol: value.protocol,
      host: value.host,
      port: value.port,
      username: value.username,
      passwordRef: value.password ? this.cipher.encrypt(value.password) : '',
      passwordConfigured: Boolean(value.password),
      ...this.fingerprints(value),
      status: value.status ?? 'active',
      expiresAt:
        value.expires_at === null || value.expires_at === undefined
          ? null
          : new Date(value.expires_at * 1000),
      expiryWarnDays: value.expiry_warn_days ?? 7,
      fallbackMode: value.fallback_mode ?? 'none',
      backupProxyId: value.backup_proxy_id ?? null,
      lastTest: null,
      lastQuality: null,
    }
  }

  private async save(entity: IpProxyEntity) {
    try {
      return this.view(await this.repository.save(entity))
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('代理已存在')
      throw new InternalServerErrorException('代理保存失败，请重试')
    }
  }

  private normalize(input: ProxyFieldsDto) {
    if (
      [
        'name',
        'protocol',
        'host',
        'port',
        'username',
        'password',
        'status',
        'expiry_warn_days',
        'fallback_mode',
      ].some((key) => input[key] === null)
    )
      throw new BadRequestException('代理配置字段不能为 null')
    const value = {
      ...input,
      name: input.name?.trim() || 'default',
      host: input.host?.trim(),
      username: input.username?.trim() ?? '',
      password: input.password?.trim() ?? '',
    }
    const dto = Object.assign(new ProxyFieldsDto(), value)
    if (
      validateSync(dto, { validationError: { target: false, value: false } }).length ||
      !value.host ||
      /[\s/@?#\[\]]/.test(value.host)
    )
      throw new BadRequestException('代理协议、地址、端口、认证或有效期字段无效')
    return value
  }

  private async validateBackup(tenantId: string, input: ProxyFieldsDto, id?: string) {
    if (input.backup_proxy_id && input.backup_proxy_id === id)
      throw new BadRequestException('备用代理不能是自身')
    if (input.fallback_mode === 'proxy' && !input.backup_proxy_id)
      throw new BadRequestException('到期策略为备用代理时必须选择备用代理')
    if (
      input.backup_proxy_id &&
      !(await this.repository.existsBy({ tenantId, id: input.backup_proxy_id }))
    )
      throw new BadRequestException('备用代理不存在或不属于当前所属单位')
  }

  private async resolveImportedBackup(
    tenantId: string,
    item: Record<string, unknown>,
    value: ProxyFieldsDto,
    result: ProxyImportResult,
    index: number,
  ) {
    if (!item.backup_proxy_name) return
    const backup = await this.repository.findOne({
      where: { tenantId, name: String(item.backup_proxy_name) },
      order: { createdAt: 'DESC', id: 'DESC' },
    })
    value.backup_proxy_id = backup?.id ?? null
    if (!backup) {
      value.fallback_mode = 'none'
      result.errors.push({
        kind: 'proxy',
        name: `第 ${index + 1} 条`,
        message: 'backup_proxy_name 未找到，fallback_mode 已降级为 none',
      })
    }
  }

  private fingerprints(input: ProxyFieldsDto) {
    const key = getConfig('admin').credentialMasterKey
    if (!key) throw new BadRequestException('代理凭据加密密钥未配置')
    const tuple = [input.host, input.port, input.username ?? '', input.password ?? '']
    const hash = (value: unknown) =>
      createHmac('sha256', key).update(JSON.stringify(value)).digest('hex')
    return { fingerprint: hash([input.protocol, ...tuple]), batchFingerprint: hash(tuple) }
  }
}
