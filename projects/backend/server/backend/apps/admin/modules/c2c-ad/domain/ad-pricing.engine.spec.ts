import { decideAdPrice, linkedAdPrice } from './ad-pricing.engine'
import { pricingInput, quote } from './ad-pricing.fixture'

describe('one BUY-USDT pricing engine', () => {
  it('skips inactive peers only after 1200 seconds and keeps missing activity as in the source', () => {
    const input = pricingInput({ excludeInactive: true })
    input.competitorSnapshot.quotes = [
      quote('B', '7.09', { activeSeconds: 1201 }),
      quote('A', '7.08', { activeSeconds: 1200 }),
    ]
    expect(decideAdPrice(input)).toMatchObject({
      price: '7.09',
      evidence: { selected: { platformAdId: 'A' } },
    })
    delete input.competitorSnapshot.quotes[0].activeSeconds
    expect(decideAdPrice(input).price).toBe('7.1')
  })

  it('calculates the source linked discount on the fixed 0.01 price unit', () => {
    expect(linkedAdPrice('7.10', '0.01')).toBe('7.02')
    expect(linkedAdPrice('7.10', '0')).toBe('7.1')
  })
  it.each([
    [{}, '7.1', '7.1', 'B'],
    [
      { mode: 'DYNAMIC', fixedLimit: null, profitPerUsdt: '0.05', feePercent: '0.11' },
      '7.13',
      '7.14',
      'C',
    ],
    [
      { mode: 'DYNAMIC', fixedLimit: null, profitPerUsdt: '0.08', feePercent: '0.11' },
      '7.1',
      '7.11',
      'B',
    ],
  ] as const)('reproduces the three reviewed examples %j', (rule, target, limit, selected) => {
    const decision = decideAdPrice(pricingInput(rule))
    expect(decision).toMatchObject({
      action: 'UPDATE',
      price: target,
      evidence: { limit, selected: { platformAdId: selected } },
    })
  })

  it('checks the final grid price, including a peer exactly at the cap', () => {
    const input = pricingInput()
    input.competitorSnapshot.quotes = [quote('peer', '7.10')]
    expect(decideAdPrice(input)).toMatchObject({
      action: 'HOLD',
      price: null,
      evidence: { candidates: [{ targetPrice: '7.11', eligible: false }] },
    })
    input.ownAd.price = '7.11'
    expect(decideAdPrice(input).action).toBe('BLOCKED')
  })

  it('uses next grid rather than blindly adding step to an off-grid quote', () => {
    const input = pricingInput()
    input.competitorSnapshot.quotes = [quote('peer', '7.091')]
    expect(decideAdPrice(input).price).toBe('7.1')
  })

  it('rounds the cap down to 0.01 independently of the pricing step', () => {
    const input = pricingInput({ step: '0.03', fixedLimit: '7.109' })
    Object.assign(input.rule, { priceTick: '0.001' })
    const decision = decideAdPrice(input)
    expect(decision.evidence.limit).toBe('7.1')
    expect(decision.action).toBe('HOLD')
  })

  it('never crosses a price grid because of intermediate division rounding', () => {
    const input = pricingInput({
      mode: 'DYNAMIC',
      profitPerUsdt: '0',
      feePercent: '0',
    })
    const almostNextGrid = `7.10${'9'.repeat(70)}`
    input.referenceSnapshot!.quotes = [quote('reference', almostNextGrid, { side: 'SELL' })]
    input.competitorSnapshot.quotes = [quote('peer', almostNextGrid)]
    expect(decideAdPrice(input)).toMatchObject({
      action: 'HOLD',
      evidence: {
        limit: '7.1',
        candidates: [{ targetPrice: '7.11', eligible: false }],
      },
    })
  })

  it('excludes own seller references, sorts prices and records fallback position', () => {
    const input = pricingInput({
      mode: 'DYNAMIC',
      profitPerUsdt: '0.05',
      feePercent: '0',
      referencePosition: 5,
    })
    input.referenceSnapshot!.quotes = [
      quote('self-sell', '6', { side: 'SELL', traderNickname: '改过的昵称' }),
      quote('higher', '7.3', { side: 'SELL' }),
      quote('lower', '7.2', { side: 'SELL' }),
    ]
    input.ownAdIds.push('self-sell')
    expect(decideAdPrice(input).evidence).toMatchObject({
      reference: { platformAdId: 'higher' },
      actualReferencePosition: 2,
      limit: '7.25',
    })
  })

  it('never treats missing reference or nonpositive dynamic cap as unlimited', () => {
    const input = pricingInput({ mode: 'DYNAMIC', profitPerUsdt: '8', feePercent: '0' })
    expect(decideAdPrice(input).action).toBe('BLOCKED')
    input.referenceSnapshot!.quotes = []
    expect(decideAdPrice(input)).toMatchObject({
      action: 'BLOCKED',
      price: null,
      evidence: { limit: null },
    })
  })

  it('does not truncate an OKX query window before filtering payment methods', () => {
    const input = pricingInput()
    input.competitorSnapshot.quotes = [
      ...Array.from({ length: 20 }, (_, index) =>
        quote(`wrong-${index}`, '7.12', { paymentMethods: ['CASH'] }),
      ),
      quote('eligible', '7.09'),
    ]
    expect(decideAdPrice(input).evidence.selected?.platformAdId).toBe('eligible')
  })

  it('applies owned ad ids, exact follow, blacklist, amounts and payments before selection', () => {
    const input = pricingInput({ followNickname: 'B' })
    input.competitorSnapshot.quotes.push(
      quote('self', '7.09', { traderNickname: 'B' }),
      quote('B-extra', '7.09'),
    )
    input.ownAdIds.push('self')
    expect(decideAdPrice(input).evidence.selected?.platformAdId).toBe('B')
    input.rule.blockedNicknames = ['B']
    expect(decideAdPrice(input).action).toBe('HOLD')
    input.rule.blockedNicknames = []
    input.competitorSnapshot.quotes.find((item) => item.platformAdId === 'B')!.maxFiatAmount = '999'
    expect(decideAdPrice(input).action).toBe('HOLD')
  })

  it('excludes every owned buy ad by id while allowing a different trader with the same nickname', () => {
    const input = pricingInput({ fixedLimit: '7.14' })
    input.ownAdIds.push('another-own')
    input.competitorSnapshot.quotes = [
      quote('own', '7.13', { traderNickname: '新昵称' }),
      quote('another-own', '7.12', { traderNickname: '重复昵称' }),
      quote('peer', '7.09', { traderNickname: '重复昵称' }),
    ]
    expect(decideAdPrice(input)).toMatchObject({
      action: 'UPDATE',
      price: '7.1',
      evidence: {
        ownAdIds: ['own', 'another-own'],
        selected: { platformAdId: 'peer' },
        candidates: [
          { quote: { platformAdId: 'own' }, reason: '自己的广告', eligible: false },
          { quote: { platformAdId: 'another-own' }, reason: '自己的广告', eligible: false },
          { quote: { platformAdId: 'peer' }, eligible: true },
        ],
      },
    })
  })

  it('holds an already correct price and blocks offline ads', () => {
    const input = pricingInput()
    input.ownAd.price = '7.100000000000000000'
    expect(decideAdPrice(input).action).toBe('HOLD')
    input.ownAd.status = 'OFFLINE'
    expect(decideAdPrice(input).action).toBe('BLOCKED')
  })
})
