import { compareMockAmount, type C2cMockAd } from '../c2c-ad/mock-ad'
import { getOkxC2cState } from './state'

const ownAd = (ad: C2cMockAd) => ({
  publicId: ad.id,
  baseCurrency: ad.asset.toLowerCase(),
  quoteCurrency: ad.fiatCurrency.toLowerCase(),
  side: ad.side.toLowerCase(),
  price: ad.price,
  online: ad.status === 'ONLINE' ? true : ad.status === 'OFFLINE' ? false : undefined,
  type: 'limit',
  availableAmount: ad.availableAmount,
  quoteMinAmountPerOrder: ad.minFiatAmount,
  quoteMaxAmountPerOrder: ad.maxFiatAmount,
  paymentMethods: ad.paymentMethods,
  accountVos: [
    { receiptDetailVos: ad.receiptIds.map((receiptAccountId) => ({ receiptAccountId })) },
  ],
})

export function handleOkxAds(request: {
  path: string
  body: Record<string, unknown>
  query: Record<string, string>
}) {
  const state = getOkxC2cState()
  const success = (data: unknown) => ({ status: 200, body: { code: 0, data } })
  if (request.path.endsWith('/getMyAds')) {
    const page = Number(request.query.page)
    const rows = Number(request.query.pagesize)
    const ads = state.ads.list().filter((ad) => ad.isOwn)
    return success({ current: { items: ads.slice((page - 1) * rows, page * rows).map(ownAd) } })
  }
  if (request.path.endsWith('/modify')) {
    const ad = state.ads.find(String(request.body.publicId))
    if (!ad?.isOwn) throw new Error('广告不存在')
    if (
      request.body.baseAmount !== ad.availableAmount ||
      request.body.receiptIds !== ad.receiptIds.join(' ')
    )
      throw new Error('广告额度或收款方式不是最新数据')
    if (typeof request.body.price !== 'string') throw new Error('price必须是字符串')
    if (request.body.online !== (ad.status === 'ONLINE'))
      throw new Error('禁止在调价时改变广告上下架状态')
    const id = ad.nextPlatformAdId ?? ad.id
    state.ads.delete(ad.id)
    state.ads.insert({ ...ad, id, price: request.body.price })
    return success({ publicId: id })
  }
  const { query } = request
  const side = query.side.toUpperCase()
  const market = state.ads
    .list()
    .filter(
      (ad) =>
        ad.status === 'ONLINE' &&
        ad.asset.toLowerCase() === query.cryptoCurrency &&
        ad.fiatCurrency.toLowerCase() === query.fiatCurrency &&
        ad.side === side &&
        (query.userType !== 'certified' || ad.isMerchant),
    )
    .sort((left, right) =>
      side === 'BUY'
        ? compareMockAmount(right.price, left.price)
        : compareMockAmount(left.price, right.price),
    )
  const page = Number(query.currentPage)
  const rows = Number(query.numberPerPage)
  return success({
    [query.side]: market
      .slice((page - 1) * rows, page * rows)
      .map((ad) => ({ ...ownAd(ad), nickName: ad.traderNickname })),
  })
}
