import {
  normalizeBinanceAd,
  normalizeBinanceMarketQuote,
  normalizeOkxAd,
  normalizeOkxMarketQuote,
} from './c2c-ad-normalizer'

const binanceAd = {
  advNo: '90000000000000000001',
  asset: 'USDT',
  fiatUnit: 'CNY',
  tradeType: 'BUY',
  price: '7.10',
  advStatus: 1,
  surplusAmount: '100',
  minSingleTransAmount: '100',
  maxSingleTransAmount: '5000',
  dynamicMaxSingleTransAmount: '1000',
  tradeMethods: [{ identifier: 'BANK' }],
}
const okxAd = {
  publicId: '90000000000000000002',
  baseCurrency: 'usdt',
  quoteCurrency: 'cny',
  side: 'buy',
  price: '7.10',
  online: true,
  availableAmount: '100',
  quoteMinAmountPerOrder: '100',
  quoteMaxAmountPerOrder: '5000',
  paymentMethods: ['BANK'],
  nickName: '同行 B',
}
const cases = [
  {
    name: 'Binance own ad',
    raw: binanceAd,
    minimum: 'minSingleTransAmount',
    maximum: 'maxSingleTransAmount',
    normalize: normalizeBinanceAd,
  },
  {
    name: 'Binance market',
    raw: binanceAd,
    minimum: 'minSingleTransAmount',
    maximum: 'dynamicMaxSingleTransAmount',
    normalize: (raw: Record<string, unknown>) =>
      normalizeBinanceMarketQuote({ adv: raw, advertiser: { nickName: '同行 B' } }, 'BUY'),
  },
  {
    name: 'OKX own ad',
    raw: okxAd,
    minimum: 'quoteMinAmountPerOrder',
    maximum: 'quoteMaxAmountPerOrder',
    normalize: normalizeOkxAd,
  },
  {
    name: 'OKX market',
    raw: okxAd,
    minimum: 'quoteMinAmountPerOrder',
    maximum: 'quoteMaxAmountPerOrder',
    normalize: (raw: Record<string, unknown>) => normalizeOkxMarketQuote(raw, 'BUY', 'USDT', 'CNY'),
  },
]

it.each([
  [1, 'ONLINE'],
  [3, 'OFFLINE'],
  [4, 'OFFLINE'],
  [0, 'UNKNOWN'],
  [2, 'UNKNOWN'],
  [undefined, 'UNKNOWN'],
  ['ONLINE', 'UNKNOWN'],
])('maps Binance advStatus %s using the documented integer enum', (advStatus, expected) => {
  expect(normalizeBinanceAd({ ...binanceAd, advStatus }).status).toBe(expected)
})

describe.each(cases)('$name amount validation', ({ raw, minimum, maximum, normalize }) => {
  it.each(['0', '-0.01'])('rejects a nonpositive price %s', (price) => {
    expect(() => normalize({ ...raw, price })).toThrow('price 必须大于 0')
  })

  it('rejects negative limits and inverted ranges', () => {
    expect(() => normalize({ ...raw, [minimum]: '-1' })).toThrow('minFiatAmount 必须大于等于 0')
    expect(() => normalize({ ...raw, [maximum]: '-1' })).toThrow('maxFiatAmount 必须大于等于 0')
    expect(() => normalize({ ...raw, [minimum]: '1001', [maximum]: '1000' })).toThrow(
      '最低限额不能大于最高限额',
    )
  })

  it('accepts zero limits without turning a valid positive decimal price into a number', () => {
    expect(normalize({ ...raw, price: '0.000001', [minimum]: '0', [maximum]: '0' })).toMatchObject({
      price: '0.000001',
      minFiatAmount: '0',
      maxFiatAmount: '0',
    })
  })
})

it('rejects negative available amounts for both providers and permits zero availability', () => {
  expect(() => normalizeBinanceAd({ ...binanceAd, surplusAmount: '-0.01' })).toThrow(
    'surplusAmount 必须大于等于 0',
  )
  expect(() => normalizeOkxAd({ ...okxAd, availableAmount: '-0.01' })).toThrow(
    'availableAmount 必须大于等于 0',
  )
  expect(normalizeBinanceAd({ ...binanceAd, surplusAmount: '0' }).availableAmount).toBe('0')
  expect(normalizeOkxAd({ ...okxAd, availableAmount: '0' }).availableAmount).toBe('0')
})
