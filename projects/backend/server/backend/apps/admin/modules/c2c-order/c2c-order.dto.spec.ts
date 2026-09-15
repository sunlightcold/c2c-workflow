import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { MerchantOrderListDto } from './c2c-order.dto'

describe('MerchantOrderListDto', () => {
  it.each([undefined, ''])('accepts an omitted merchant filter (%p)', async (merchantId) => {
    const dto = plainToInstance(MerchantOrderListDto, {
      merchantId,
      page: 1,
      pageSize: 20,
    })

    await expect(validate(dto)).resolves.toEqual([])
    expect(dto.merchantId).toBeUndefined()
  })

  it('still rejects a non-UUID merchant filter', async () => {
    const dto = plainToInstance(MerchantOrderListDto, {
      merchantId: 'not-a-uuid',
      page: 1,
      pageSize: 20,
    })

    await expect(validate(dto)).resolves.toEqual([
      expect.objectContaining({ property: 'merchantId' }),
    ])
  })
})
