export enum BusinessStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum TenantType {
  HEADQUARTERS_SELF = 'HEADQUARTERS_SELF',
  AGENT = 'AGENT',
}

export enum MerchantPlatform {
  BINANCE = 'BINANCE',
  OKX = 'OKX',
}

export enum PaymentExecutionMode {
  INSTANT = 'INSTANT',
  BATCH = 'BATCH',
}

export enum PaymentBatchRuleType {
  MANUAL = 'MANUAL',
  INTERVAL = 'INTERVAL',
  ORDER_COUNT = 'ORDER_COUNT',
}

export enum PaymentBatchPolicyScope {
  GLOBAL = 'GLOBAL',
  MERCHANT = 'MERCHANT',
}

export enum PaymentAdapterCode {
  ALIPAY_BATCH = 'ALIPAY_BATCH',
  ALIPAY_MERCHANT_TRANSFER = 'ALIPAY_MERCHANT_TRANSFER',
}

export enum MerchantOrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum MerchantOrderStatus {
  NEW = 'NEW',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
  PAID_PENDING_PLATFORM_CONFIRM = 'PAID_PENDING_PLATFORM_CONFIRM',
  PENDING_RELEASE = 'PENDING_RELEASE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  DISPUTED = 'DISPUTED',
  FUNDS_EXCEPTION = 'FUNDS_EXCEPTION',
  EXCEPTION = 'EXCEPTION',
}
