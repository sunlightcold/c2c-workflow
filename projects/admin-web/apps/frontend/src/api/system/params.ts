import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';

import type { ParamsTypeEnum } from '#/constants';

import { requestClient } from '#/api/request';

export namespace ParamsApi {
  export interface ParamsData {
    id: number;
    name: string;
    key: string;
    value: string;
    type: ParamsTypeEnum;
    description?: string;
  }

  export type ParamsFilterParams = CommonPageParams;

  export type CreateParamsParams = Omit<ParamsData, 'id'>;

  export type UpdateParamsParams = ParamsData;
}

export function createParamsApi(data: ParamsApi.CreateParamsParams) {
  return requestClient.post<ParamsApi.ParamsData>('/sys/params', data);
}

export function updateParamsApi(
  id: number,
  data: ParamsApi.UpdateParamsParams,
) {
  return requestClient.put<ParamsApi.ParamsData>(`/sys/params/${id}`, data);
}

export function removeParamsApi(id: number) {
  return requestClient.delete(`/sys/params/${id}`);
}

export function filterParamsApi(query: ParamsApi.ParamsFilterParams) {
  return requestClient.get<CommonPaginationData<ParamsApi.ParamsData>>(
    `/sys/params/filter`,
    { params: query },
  );
}
