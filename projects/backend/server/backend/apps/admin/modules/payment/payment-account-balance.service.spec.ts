import { PaymentAccountBalanceService } from './payment-account-balance.service'

describe('PaymentAccountBalanceService', () => {
  const query = {
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  }
  const accounts = { createQueryBuilder: jest.fn().mockReturnValue(query) }
  const gateways = { create: jest.fn() }
  const service = new PaymentAccountBalanceService(accounts as never, gateways as never)

  beforeEach(() => jest.clearAllMocks())

  it('queries only active Alipay accounts linked to the merchant payment plans', async () => {
    query.getMany.mockResolvedValue([
      {
        id: 'account-1',
        name: '支付宝主账号',
        externalAccountId: '20880001',
        credentialRef: 'env://ALI_1',
      },
    ])
    gateways.create.mockResolvedValue({
      execute: jest.fn().mockResolvedValue({
        code: '10000',
        availableAmount: '100.00',
        freezeAmount: '20.00',
      }),
    })

    await expect(service.queryMerchantAccounts('tenant-1', 'merchant-1')).resolves.toEqual([
      {
        accountId: 'account-1',
        accountName: '支付宝主账号',
        availableAmount: '100.00',
        freezeAmount: '20.00',
        success: true,
      },
    ])
    expect(query.where).toHaveBeenCalledWith('account."tenantId" = :tenantId', {
      tenantId: 'tenant-1',
    })
    expect(query.andWhere).toHaveBeenCalledWith('plan."merchantId" = :merchantId', {
      merchantId: 'merchant-1',
    })
    expect(gateways.create).toHaveBeenCalledWith('env://ALI_1')
  })

  it('reports an account query failure without leaking the upstream error', async () => {
    query.getMany.mockResolvedValue([
      {
        id: 'account-1',
        name: '支付宝主账号',
        externalAccountId: '20880001',
        credentialRef: 'env://ALI_1',
      },
    ])
    gateways.create.mockRejectedValue(new Error('secret://credential-value'))

    await expect(service.queryMerchantAccounts('tenant-1', 'merchant-1')).resolves.toEqual([
      { accountId: 'account-1', accountName: '支付宝主账号', success: false },
    ])
  })
})
