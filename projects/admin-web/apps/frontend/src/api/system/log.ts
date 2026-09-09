import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace LogApi {
  /**
   * 日志信息
   */
  export interface LogData {
    _id: string;
    title: string;
    operationType: string;
    method: number;
    ip: string;
    url: string;
    os: string;
    browser: string;
    city: string;
    country: string;
    region: string;
    agent: string;
    username: string;
    params: string;
    body: string;
    query: string;
  }

  /**
   * 分页查询日志参数
   */
  export type LogFilterParams = CommonPageParams;
}

export function filterLogsApi(query: LogApi.LogFilterParams) {
  return requestClient.get<CommonPaginationData<LogApi.LogData>>(
    `/sys/logs/filter`,
    { params: query },
  );
}
