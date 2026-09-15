import { requestClient } from '#/api/request';

export namespace DashboardApi {
  export interface Summary {
    activeBotCount: number;
    activeGroupCount: number;
    activeMerchantCount: number;
    automatedMerchantCount: number;
    batchCount: number;
    batchExceptionCount: number;
    batchProcessingCount: number;
    batchSuccessCount: number;
    merchantOrderAmount: string;
    merchantOrderCount: number;
    pendingPaymentCount: number;
    pendingReleaseCount: number;
    paymentAmount: string;
    paymentCount: number;
    paymentExceptionCount: number;
    paymentProcessingCount: number;
    paymentSuccessAmount: string;
    paymentSuccessCount: number;
    paymentSuccessRate: string;
  }

  export interface DailyTrend {
    date: string;
    merchantOrderAmount: string;
    merchantOrderCount: number;
    paymentAmount: string;
    paymentCount: number;
    paymentSuccessAmount: string;
    paymentSuccessCount: number;
  }

  export interface Distribution {
    amount: string;
    count: number;
    key: string;
  }

  export interface Platform {
    amount: string;
    merchantOrderCount: number;
    paidCount: number;
    pendingCount: number;
    platform: 'BINANCE' | 'OKX';
  }

  export interface MerchantRanking {
    merchantId: string;
    merchantName: string;
    paymentAmount: string;
    paymentCount: number;
    platform: 'BINANCE' | 'OKX';
    successAmount: string;
    successCount: number;
    successRate: string;
  }

  export interface Overview {
    dailyTrend: DailyTrend[];
    generatedAt: string;
    merchantRanking: MerchantRanking[];
    paymentSources: Distribution[];
    paymentStatuses: Distribution[];
    platforms: Platform[];
    range: { dateFrom: string; dateTo: string; days: number };
    summary: Summary;
  }
}

export function getDashboardOverviewApi(params: {
  days: 7 | 14 | 30;
  tenantId: string;
}) {
  return requestClient.get<DashboardApi.Overview>('/sys/dashboard/overview', {
    params,
  });
}
