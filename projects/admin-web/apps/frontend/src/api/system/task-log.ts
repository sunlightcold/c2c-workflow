import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace TaskLogApi {
  /**
   * 定时任务日志信息
   */
  export interface TaskLogData {
    id: string;
    taskId: string;
    taskSource?: 'custom' | 'system';
    taskName: string;
    consumeTime: number;
    status: number;
    detail?: string;
    startedAt: string;
    endedAt: string;
  }

  /**
   * 分页查询定时任务日志参数
   */
  export type TaskLogFilterParams = CommonPageParams & {
    taskSource?: 'custom' | 'system';
  };
}

export function filterTaskLogsApi(query: TaskLogApi.TaskLogFilterParams) {
  return requestClient.get<CommonPaginationData<TaskLogApi.TaskLogData>>(
    `/sys/logs/task/filter`,
    { params: query },
  );
}
