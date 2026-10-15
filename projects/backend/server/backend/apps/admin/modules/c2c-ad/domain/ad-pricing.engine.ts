import Big from 'big.js'
import { AD_PRICE_TICK } from './ad-pricing.types'
import type { C2cMarketQuote } from '../../c2c-platform/c2c-ad.types'
import type {
  AdPricingInput,
  CandidateEvidence,
  PriceDecision,
  PriceEvidence,
} from './ad-pricing.types'

function sortedQuotes(quotes: C2cMarketQuote[], descending: boolean): C2cMarketQuote[] {
  return [...new Map(quotes.map((quote) => [quote.platformAdId, quote])).values()].sort(
    (a, b) =>
      (descending ? new Big(b.price).cmp(a.price) : new Big(a.price).cmp(b.price)) ||
      a.platformAdId.localeCompare(b.platformAdId),
  )
}

function matchesPayments(quote: C2cMarketQuote, methods: string[]): boolean {
  return methods.length === 0 || methods.some((method) => quote.paymentMethods.includes(method))
}

/** One merchant BUY-USDT algorithm. No platform, credentials, persistence or IO. */
export function decideAdPrice(input: AdPricingInput): PriceDecision {
  const { rule, ownAd } = input
  const ownAdIds = new Set(input.ownAdIds)
  const evidence: PriceEvidence = {
    rule,
    ownAdIds: input.ownAdIds,
    limit: null,
    rawLimit: null,
    reference: null,
    actualReferencePosition: null,
    selected: null,
    candidates: [],
    competitorQuery: input.competitorQuery,
    referenceQuery: input.referenceQuery,
    competitorSnapshot: input.competitorSnapshot,
    referenceSnapshot: input.referenceSnapshot,
  }
  const result = (
    action: PriceDecision['action'],
    reason: string,
    price: string | null = null,
  ): PriceDecision => ({ action, reason, price, evidence })
  if (ownAd.asset !== 'USDT' || ownAd.side !== 'BUY' || ownAd.status !== 'ONLINE') {
    return result('BLOCKED', '只对在线的买 USDT 广告调价')
  }
  let rawLimit: Big
  if (rule.mode === 'DYNAMIC') {
    const references = sortedQuotes(
      (input.referenceSnapshot?.quotes ?? []).filter(
        (quote) =>
          !ownAdIds.has(quote.platformAdId) &&
          quote.side === 'SELL' &&
          quote.asset === ownAd.asset &&
          quote.fiatCurrency === ownAd.fiatCurrency &&
          matchesPayments(quote, rule.referencePaymentMethods),
      ),
      false,
    ).slice(0, 10)
    if (!references.length) return result('BLOCKED', '没有符合条件的卖币参考报价')
    const position = Math.min(rule.referencePosition, references.length)
    const reference = references[position - 1]
    evidence.reference = reference
    evidence.actualReferencePosition = position
    rawLimit = new Big(reference.price)
      .minus(rule.profitPerUsdt!)
      .minus(new Big(reference.price).times(rule.feePercent!).times('0.01'))
  } else {
    rawLimit = new Big(rule.fixedLimit!)
  }
  evidence.rawLimit = rawLimit.toFixed()
  const limit = rawLimit.minus(rawLimit.mod(AD_PRICE_TICK))
  evidence.limit = limit.toFixed()
  if (limit.lte(0)) return result('BLOCKED', '本轮买价上限不大于 0')

  const candidates = sortedQuotes(input.competitorSnapshot.quotes, true).map(
    (quote): CandidateEvidence => {
      const excluded = (reason: string): CandidateEvidence => ({
        quote,
        targetPrice: null,
        reason,
        eligible: false,
      })
      if (ownAdIds.has(quote.platformAdId)) return excluded('自己的广告')
      if (
        quote.side !== 'BUY' ||
        quote.asset !== ownAd.asset ||
        quote.fiatCurrency !== ownAd.fiatCurrency
      )
        return excluded('币种、法币或买卖方向不匹配')
      if (rule.blockedNicknames.includes(quote.traderNickname)) return excluded('同行在黑名单中')
      if (rule.followNickname && quote.traderNickname !== rule.followNickname)
        return excluded('不是指定同行')
      if (!matchesPayments(quote, rule.competitorPaymentMethods)) return excluded('支付方式不匹配')
      if (rule.excludeInactive && (quote.activeSeconds ?? 0) > 1200)
        return excluded('同行超过 20 分钟未活跃')
      const amount = new Big(rule.competitorAmount)
      if (amount.gt(0) && (amount.lt(quote.minFiatAmount) || amount.gt(quote.maxFiatAmount)))
        return excluded('查询金额不在同行交易限额内')
      const price = new Big(quote.price)
      const target = price.minus(price.mod(rule.step)).plus(rule.step)
      return {
        quote,
        targetPrice: target.toFixed(),
        eligible: target.lte(limit),
        reason: target.lte(limit) ? '目标价未超过上限' : '加价后的目标价超过上限',
      }
    },
  )
  evidence.candidates = candidates
  const selected = candidates.find((candidate) => candidate.eligible)
  if (!selected)
    return new Big(ownAd.price).gt(limit)
      ? result('BLOCKED', '没有合格同行，当前价已超过上限；请人工处理仍在线的广告')
      : result('HOLD', '没有合格同行，当前价未超过上限，保持价格')
  evidence.selected = selected.quote
  return new Big(ownAd.price).eq(selected.targetPrice!)
    ? result('HOLD', '当前价格已等于本轮建议价', selected.targetPrice)
    : result('UPDATE', '采用本轮取得的合格同行中最高目标价', selected.targetPrice)
}

export function linkedAdPrice(mainPrice: string, discount: string): string {
  const raw = new Big(mainPrice).times(new Big(1).minus(discount))
  return raw.minus(raw.mod(AD_PRICE_TICK)).toFixed()
}
