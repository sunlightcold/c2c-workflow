import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace RoleApi {
  export interface RoleData {
    id: number;
    value: string;
    name: string;
    description?: string;
  }

  export interface RoleInfoData extends RoleData {
    menuIds?: string[];
  }

  export type RoleFilterParams = CommonPageParams;

  export interface CreateRoleParams extends Omit<RoleData, 'id'> {
    menuIds?: number[];
  }

  export type UpdateRoleParams = RoleData;
}

export function createRoleApi(data: RoleApi.CreateRoleParams) {
  return requestClient.post('/sys/roles', data);
}

export function updateRoleApi(id: number, data: RoleApi.UpdateRoleParams) {
  return requestClient.put(`/sys/roles/${id}`, data);
}

export function removeRoleApi(id: number) {
  return requestClient.delete(`/sys/roles/${id}`);
}

export function getRolesApi() {
  return requestClient.get<RoleApi.RoleData[]>(`/sys/roles`);
}

export async function getRoleApi(id: number) {
  const res = await requestClient.get<RoleApi.RoleInfoData>(`/sys/roles/${id}`);
  return { ...res, menuIds: res.menuIds?.map((item) => item.toString()) };
}

export function filterRolesApi(query: RoleApi.RoleFilterParams) {
  return requestClient.get<CommonPaginationData<RoleApi.RoleData>>(
    `/sys/roles/filter`,
    { params: query },
  );
}
