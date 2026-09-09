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

export enum PaymentAdapterCode {
  ALIPAY_BATCH = 'ALIPAY_BATCH',
  ALIPAY_MERCHANT_TRANSFER = 'ALIPAY_MERCHANT_TRANSFER',
}
