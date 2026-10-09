import { MerchantEntity } from '@admin/database'
import { addDecimalStrings } from '@/common/utils/decimal'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import {
  C2cPlatformClient,
  C2cPlatformCredentialFactory,
  type C2cReportOrder,
  type C2cReportPage,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'
import { Inject } from '@nestjs/common'

const PAGE_ROWS = 50

export interface C2cProviderDailyReport {
  orderCount: number
  assetAmount: string
  fiatAmount: string
  statusSummary: Record<string, { orderCount: number; assetAmount: string; fiatAmount: string }>
}

@Injectable()
export class C2cReportService {
  constructor(
    @InjectRepository(MerchantEntity) private readonly merchants: Repository<MerchantEntity>,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
  ) {}

  async getProviderDailyReport(
    tenantId: string,
    merchantId: string,
    start: Date,
    endExclusive: Date,
  ): Promise<C2cProviderDailyReport> {
    const { merchant, credentials } = await this.resolveContext(tenantId, merchantId)
    const orders = await this.readPages((page) =>
      this.platformClient.listReportOrders(merchant.platform, credentials, {
        startTimestamp: start.getTime(),
        endTimestamp: endExclusive.getTime() - 1,
        page,
        rows: PAGE_ROWS,
        tradeType: 'BUY',
      }),
    )
    return this.aggregate(orders)
  }

  async getProviderOrders(
    tenantId: string,
    merchantId: string,
    start: Date,
    endExclusive: Date,
  ): Promise<C2cReportOrder[]> {
    const { merchant, credentials } = await this.resolveContext(tenantId, merchantId)
    const pending = await this.readPages((page) =>
      this.platformClient.listOrders(merchant.platform, credentials, {
        startDate: start.getTime(),
        endDate: endExclusive.getTime() - 1,
        asset: 'USDT',
        tradeType: 'BUY',
        orderStatusList: [],
        page,
        rows: PAGE_ROWS,
      }),
    )
    const history = await this.readPages((page) =>
      this.platformClient.listReportOrders(merchant.platform, credentials, {
        startTimestamp: start.getTime(),
        endTimestamp: endExclusive.getTime() - 1,
        page,
        rows: PAGE_ROWS,
        tradeType: 'BUY',
      }),
    )
    // History is queried last so a newly completed order supersedes its pending snapshot.
    const byId = new Map<string, C2cReportOrder>()
    for (const order of [...pending, ...history]) {
      const createdAt = new Date(order.createdAt).getTime()
      if (
        order.side === 'BUY' &&
        order.asset === 'USDT' &&
        order.fiatCurrency === 'CNY' &&
        createdAt >= start.getTime() &&
        createdAt < endExclusive.getTime()
      ) {
        byId.set(order.platformOrderId, order)
      }
    }
    return [...byId.values()]
  }

  private async resolveContext(tenantId: string, merchantId: string) {
    const merchant = await this.merchants.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant) throw new NotFoundException('商家不存在')
    const reference = await this.credentialService.getActiveReference(tenantId, merchantId)
    const secret = await this.secretResolver.resolve(reference.credentialRef)
    const credentials = this.credentialFactory.create(merchant.platform, reference, secret)
    return { merchant, credentials }
  }

  private async readPages(load: (page: number) => Promise<C2cReportPage>) {
    const orders: C2cReportOrder[] = []
    const pages = new Set<string>()
    let page = 1
    let response
    do {
      response = await load(page)
      const received = response.rawItemCount ?? response.items.length
      const expected = Math.min(PAGE_ROWS, Math.max(0, response.total - (page - 1) * PAGE_ROWS))
      if (
        (response.rawItemCount !== undefined && received < expected) ||
        (!received && response.hasMore)
      ) {
        throw new Error('平台订单分页不完整，暂无法核对')
      }
      const orderIds = response.rawOrderIds ?? response.items.map((order) => order.platformOrderId)
      if (orderIds.length) {
        const key = JSON.stringify(orderIds)
        if (pages.has(key)) throw new Error('平台订单分页重复，数据不完整')
        pages.add(key)
      }
      orders.push(...response.items)
      page += 1
    } while (response.hasMore)
    return orders
  }

  private aggregate(orders: C2cReportOrder[]): C2cProviderDailyReport {
    const statusSummary: C2cProviderDailyReport['statusSummary'] = {}
    let assetAmount = '0'
    let fiatAmount = '0'
    for (const order of orders) {
      const summary = statusSummary[order.status] ?? {
        orderCount: 0,
        assetAmount: '0',
        fiatAmount: '0',
      }
      summary.orderCount += 1
      summary.assetAmount = addDecimalStrings(summary.assetAmount, order.assetAmount)
      summary.fiatAmount = addDecimalStrings(summary.fiatAmount, order.fiatAmount)
      statusSummary[order.status] = summary
      assetAmount = addDecimalStrings(assetAmount, order.assetAmount)
      fiatAmount = addDecimalStrings(fiatAmount, order.fiatAmount)
    }
    return {
      orderCount: orders.length,
      assetAmount,
      fiatAmount,
      statusSummary,
    }
  }
}
