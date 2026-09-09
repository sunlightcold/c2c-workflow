/**
 * @description: 通用分页参数
 */
export interface CommonPageParams {
  pageIndex: number;
  pageSize: number;
}

/**
 * @description: 通用分页返回参数
 */
export interface CommonPaginationData<T> {
  meta: {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    totalPages: number;
  };
  items: T[];
}

/**
 * 支付方式
 */
export type PfaPayWay = 'alipay' | 'bank' | 'ecny' | 'wxpay';

/**
 * select option
 */
export interface SelectOption<T = any> {
  label: string;
  value: T;
}
