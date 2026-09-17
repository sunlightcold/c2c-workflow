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
    const merchant = await this.merchants.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant) throw new NotFoundException('商家不存在')
    const reference = await this.credentialService.getActiveReference(tenantId, merchantId)
    const secret = await this.secretResolver.resolve(reference.credentialRef)
    const credentials = this.credentialFactory.create(merchant.platform, reference, secret)
    const orders: C2cReportOrder[] = []
    let page = 1
    let response
    do {
      response = await this.platformClient.listReportOrders(merchant.platform, credentials, {
        startTimestamp: start.getTime(),
        endTimestamp: endExclusive.getTime() - 1,
        page,
        rows: PAGE_ROWS,
        tradeType: 'BUY',
      })
      orders.push(...response.items)
      page += 1
    } while (response.hasMore)
    return this.aggregate(orders)
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
