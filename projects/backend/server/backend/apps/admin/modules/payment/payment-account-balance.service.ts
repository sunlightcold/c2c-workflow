import { BusinessStatus, PaymentAccountEntity } from '@admin/database'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ALIPAY_ACCOUNT_GATEWAY_FACTORY,
  type AlipayAccountGatewayFactory,
} from './alipay-account-gateway.provider'

interface AlipayBalanceResponse {
  code: string
  msg?: string
  subMsg?: string
  availableAmount?: string
  freezeAmount?: string
}

export interface PaymentAccountBalanceView {
  accountId: string
  accountName: string
  availableAmount?: string
  freezeAmount?: string
  success: boolean
}

@Injectable()
export class PaymentAccountBalanceService {
  constructor(
    @InjectRepository(PaymentAccountEntity)
    private readonly accounts: Repository<PaymentAccountEntity>,
    @Inject(ALIPAY_ACCOUNT_GATEWAY_FACTORY)
    private readonly gateways: AlipayAccountGatewayFactory,
  ) {}

  async queryMerchantAccounts(
    tenantId: string,
    merchantId: string,
  ): Promise<PaymentAccountBalanceView[]> {
    const accounts = await this.accounts
      .createQueryBuilder('account')
      .addSelect('account.credentialRef')
      .innerJoin(
        'merchant_payment_plan',
        'plan',
        'plan."paymentAccountId" = account.id AND plan."tenantId" = account."tenantId"',
      )
      .innerJoin('payment_platform', 'platform', 'platform.id = account."platformId"')
      .where('account."tenantId" = :tenantId', { tenantId })
      .andWhere('plan."merchantId" = :merchantId', { merchantId })
      .andWhere('account.status = :status', { status: BusinessStatus.ACTIVE })
      .andWhere('plan.status = :status', { status: BusinessStatus.ACTIVE })
      .andWhere('platform.status = :status', { status: BusinessStatus.ACTIVE })
      .andWhere('platform.code = :platformCode', { platformCode: 'ALIPAY' })
      .orderBy('account.name', 'ASC')
      .getMany()
    const uniqueAccounts = [...new Map(accounts.map((account) => [account.id, account])).values()]
    return Promise.all(uniqueAccounts.map((account) => this.queryAccount(account)))
  }

  private async queryAccount(account: PaymentAccountEntity): Promise<PaymentAccountBalanceView> {
    const base = { accountId: account.id, accountName: account.name }
    try {
      const gateway = await this.gateways.create(account.credentialRef)
      const response = await gateway.execute<AlipayBalanceResponse>('alipay.fund.account.query', {
        alipay_user_id: account.externalAccountId,
        account_type: 'ACCTRANS_ACCOUNT',
      })
      if (response.code !== '10000' || !response.availableAmount || !response.freezeAmount) {
        return { ...base, success: false }
      }
      return {
        ...base,
        success: true,
        availableAmount: response.availableAmount,
        freezeAmount: response.freezeAmount,
      }
    } catch {
      return { ...base, success: false }
    }
  }
}
