import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace TaskApi {
  /**
   * 定时任务信息
   */
  export interface TaskData {
    id: string;
    source?: 'custom' | 'system';
    name: string;
    service: string;
    type: string;
    startedAt: string;
    endedAt: string;
    limit: number;
    cron: string;
    every: number;
    data: string;
    status: number;
    description: string;
  }

  /**
   * 分页查询定时任务参数
   */
  export type TaskFilterParams = CommonPageParams & {
    source?: 'custom' | 'system';
  };

  /**
   * 新建定时任务参数
   */
  export type CreateTaskParams = Omit<TaskData, '_id'>;

  /**
   * 更新定时任务参数
   */
  export type UpdateTaskParams = Partial<Omit<TaskData, 'id'>>;
}

export function createTaskApi(data: TaskApi.CreateTaskParams) {
  return requestClient.post<TaskApi.TaskData>('/sys/tasks', data);
}

export function updateTaskApi(id: string, data: TaskApi.UpdateTaskParams) {
  return requestClient.put<TaskApi.TaskData>(`/sys/tasks/${id}`, data);
}

export function removeTaskApi(id: string) {
  return requestClient.delete(`/sys/tasks/${id}`);
}

export function filterTasksApi(query: TaskApi.TaskFilterParams) {
  return requestClient.get<CommonPaginationData<TaskApi.TaskData>>(
    `/sys/tasks/filter`,
    { params: query },
  );
}

export function startTaskApi(id: string) {
  return requestClient.put(`/sys/tasks/${id}/start`);
}

export function stopTaskApi(id: string) {
  return requestClient.put(`/sys/tasks/${id}/stop`);
}

export function onceTaskApi(id: string) {
  return requestClient.put(`/sys/tasks/${id}/once`);
}
