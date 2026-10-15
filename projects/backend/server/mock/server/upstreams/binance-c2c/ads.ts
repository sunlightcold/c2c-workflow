import { compareMockAmount, type C2cMockAd } from '../c2c-ad/mock-ad'
import { getBinanceC2cState } from './state'

const ownAd = (ad: C2cMockAd) => ({
  advNo: ad.id,
  asset: ad.asset,
  fiatUnit: ad.fiatCurrency,
  tradeType: ad.side,
  payTimeLimit: ad.periodMinutes,
  price: ad.price,
  advStatus: ad.status === 'ONLINE' ? 1 : ad.status === 'OFFLINE' ? 3 : 0,
  surplusAmount: ad.availableAmount,
  minSingleTransAmount: ad.minFiatAmount,
  maxSingleTransAmount: ad.maxFiatAmount,
  dynamicMaxSingleTransAmount: ad.maxFiatAmount,
  tradeMethods: ad.paymentMethods.map((identifier) => ({ identifier })),
})

export function handleBinanceAds(request: {
  path: string
  body: Record<string, unknown>
  query: Record<string, string>
  headers: Headers
}) {
  const state = getBinanceC2cState()
  const success = (data: unknown, total?: number) => ({
    status: 200,
    body: { code: '000000', success: true, data, ...(total === undefined ? {} : { total }) },
  })
  const merchantId = request.headers.get('x-user-id')
  const ads = state.ads
    .list()
    .filter((ad) => ad.isOwn && (!merchantId || ad.externalMerchantId === merchantId))
  if (request.path.endsWith('/ads/listWithPagination')) {
    const page = Number(request.body.page)
    const rows = Number(request.body.rows)
    return success(ads.slice((page - 1) * rows, page * rows).map(ownAd), ads.length)
  }
  if (request.path.endsWith('/ads/getDetailByNo')) {
    const ad = ads.find((item) => item.id === request.query.adsNo)
    if (!ad) throw new Error('广告不存在')
    return success(ownAd(ad))
  }
  if (request.path.endsWith('/ads/update')) {
    const ad = ads.find((item) => item.id === request.body.advNo)
    if (!ad) throw new Error('广告不存在')
    if (typeof request.body.price !== 'string') throw new Error('price必须是字符串')
    state.ads.update(ad.id, (current) => ({ ...current, price: String(request.body.price) }))
    return success(true)
  }
  const { body } = request
  const side = body.tradeType === 'SELL' ? 'BUY' : 'SELL'
  const payTypes = body.payTypes as string[]
  const amount = String(body.transAmount)
  const periods = body.periods as string[] | undefined
  const market = state.ads
    .list()
    .filter(
      (ad) =>
        ad.status === 'ONLINE' &&
        ad.asset === body.asset &&
        ad.fiatCurrency === body.fiat &&
        ad.side === side &&
        (body.publisherType !== 'merchant' || ad.isMerchant) &&
        (!periods?.length || periods.includes(String(ad.periodMinutes))) &&
        (!payTypes.length || payTypes.some((method) => ad.paymentMethods.includes(method))) &&
        (amount === '0' ||
          (compareMockAmount(ad.minFiatAmount, amount) <= 0 &&
            compareMockAmount(ad.maxFiatAmount, amount) >= 0)),
    )
    .sort((left, right) =>
      side === 'BUY'
        ? compareMockAmount(right.price, left.price)
        : compareMockAmount(left.price, right.price),
    )
  const rows = Number(body.rows)
  const page = Number(body.page)
  return success(
    market.slice((page - 1) * rows, page * rows).map((ad) => ({
      adv: ownAd(ad),
      advertiser: { nickName: ad.traderNickname, activeTimeInSecond: ad.activeSeconds ?? 0 },
    })),
    market.length,
  )
}
