import type { MerchantAdsApi } from '#/api';

import Big from 'big.js';

export const adWechatPaymentMethods = {
  BINANCE: 'WECHAT',
  OKX: 'wxPay',
};

export function adPriceText(price: null | string) {
  return price === null ? '-' : new Big(price).toFixed(2);
}

const adPaymentMethodLabels: Record<string, string> = {
  alipay: '支付宝',
  bank: '银行卡',
  wechat: '微信支付',
  wechatnew: '微信支付',
  wxpay: '微信支付',
};

export function adPaymentMethodText(method: string) {
  return adPaymentMethodLabels[method.toLowerCase()] ?? method;
}

export const adStatusLabels: Record<MerchantAdsApi.AdStatus, string> = {
  OFFLINE: '已下架',
  ONLINE: '在线',
  UNKNOWN: '待核实',
};

export const adRunStatusLabels: Record<MerchantAdsApi.RunStatus, string> = {
  APPLIED: '已生效',
  BLOCKED: '已阻断',
  FAILED: '失败',
  HOLD: '保持原价',
  PENDING: '待核实',
  READY: '建议改价',
};

export const adRunTriggerLabels: Record<MerchantAdsApi.Run['trigger'], string> =
  {
    AUTO: '自动调价',
    MANUAL: '立即调价',
    PREVIEW: '试算',
  };

export const adRunStatusColors: Record<MerchantAdsApi.RunStatus, string> = {
  APPLIED: 'success',
  BLOCKED: 'warning',
  FAILED: 'error',
  HOLD: 'default',
  PENDING: 'processing',
  READY: 'blue',
};
