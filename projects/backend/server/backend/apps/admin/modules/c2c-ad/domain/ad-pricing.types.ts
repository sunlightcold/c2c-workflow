import type {
  C2cAd,
  C2cAdMarketQuery,
  C2cAdMarketSnapshot,
  C2cMarketQuote,
} from '../../c2c-platform/c2c-ad.types'

export const AD_PRICE_TICK = '0.01'

interface AdPricingTarget {
  id: string
  platformAdId: string
  status: C2cAd['status']
  enabled: boolean
}

export type AdPricingRelation =
  | { role: 'INDEPENDENT' }
  | { role: 'MAIN'; linkedAd: AdPricingTarget; discount: string }
  | { role: 'LINKED'; mainAd: AdPricingTarget; discount: string }

export interface UnifiedAdRule {
  excludeInactive?: boolean
  linkedAdId?: string | null
  linkedDiscount?: string | null
  mode: 'FIXED' | 'DYNAMIC'
  step: string
  competitorAmount: string
  competitorPaymentMethods: string[]
  competitorPeriod: number | null
  merchantOnly: boolean
  followNickname: string | null
  blockedNicknames: string[]
  fixedLimit: string | null
  profitPerUsdt: string | null
  feePercent: string | null
  referencePaymentMethods: string[]
  referencePosition: number
  intervalSeconds: number
}

export interface CandidateEvidence {
  quote: C2cMarketQuote
  targetPrice: string | null
  reason: string
  eligible: boolean
}

export interface LinkedAdEvidence {
  adId: string
  platformAdId: string
  currentPrice: string
  targetPrice: string
  discount: string
  runId: string | null
}

export interface PriceEvidence {
  linkedAd?: LinkedAdEvidence | null
  linkedFromRunId?: string
  rule: UnifiedAdRule
  ownAdIds: string[]
  limit: string | null
  rawLimit: string | null
  reference: C2cMarketQuote | null
  actualReferencePosition: number | null
  selected: C2cMarketQuote | null
  candidates: CandidateEvidence[]
  competitorQuery: C2cAdMarketQuery
  referenceQuery: C2cAdMarketQuery | null
  competitorSnapshot: C2cAdMarketSnapshot
  referenceSnapshot: C2cAdMarketSnapshot | null
}

export interface AdPricingInput {
  rule: UnifiedAdRule
  ownAd: C2cAd
  ownAdIds: string[]
  competitorQuery: C2cAdMarketQuery
  referenceQuery: C2cAdMarketQuery | null
  competitorSnapshot: C2cAdMarketSnapshot
  referenceSnapshot: C2cAdMarketSnapshot | null
}

export interface PriceDecision {
  action: 'UPDATE' | 'HOLD' | 'BLOCKED'
  price: string | null
  reason: string
  evidence: PriceEvidence
}
