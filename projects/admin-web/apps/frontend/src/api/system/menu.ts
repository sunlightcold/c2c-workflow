import type { Nullable, RouteRecordStringComponent } from '@vben/types';

import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';
import type { RoleApi } from './role';

import { isEmpty } from 'lodash-es';

import { requestClient } from '#/api/request';

export namespace MenuApi {
  export type MenuFilterParams = CommonPageParams;

  export type MenuRoleData = Pick<RoleApi.RoleData, 'name'>;

  export interface MenuData {
    component: string;
    icon: string;
    keepAlive: number;
    name: string;
    orderNo: number;
    parentId: Nullable<string>;
    path: string;
    permission: string;
    iframeSrc?: string;
    roles: MenuRoleData[];
    show: number;
    status: number;
    type: 'EMBED' | 'FOLDER' | 'MENU';
    id: string;
    redirect: Nullable<string>;
    children: Nullable<MenuData[]>;
  }
}

/**
 * RouteRecordStringComponent 的二次包装类型，在外层添加 id，用于适应 antd tree 组件需要的 id
 */
export type WrapperRouteRecordStringComponent = RouteRecordStringComponent & {
  id: string;
};

let cache_key = 1;
const getCacheKey = () => `Cache_Key_${cache_key++}`;

function getComponent(menu: MenuApi.MenuData) {
  if (menu.type === 'EMBED') {
    return 'IFrameView';
  } else {
    return menu.component?.length
      ? `${menu.component}/index`
      : (undefined as any);
  }
}

/**
 * 请求后端的数据获取到的菜单的信息，默认数据是拉平的，需要对数据进行树结构的整理
 */
export function generateTreeRoutes(menus: MenuApi.MenuData[]) {
  const routeDataMap = new Map<string, WrapperRouteRecordStringComponent>();
  const menuDataMap = new Map<string, MenuApi.MenuData>();
  for (const menuItem of menus) {
    if (!menuItem.id) continue;
    const route: WrapperRouteRecordStringComponent = {
      path: menuItem.path,
      name: menuItem.name || getCacheKey(),
      component: getComponent(menuItem),
      redirect: menuItem.redirect || undefined,
      meta: {
        title: menuItem.name,
        icon: menuItem.icon,
        keepAlive: menuItem.keepAlive === 1,
        id: menuItem.id,
        parentId: menuItem.parentId,
        permission: menuItem.permission,
        iframeSrc: menuItem.iframeSrc,
        show: menuItem.show === 1,
      },
      id: menuItem.id,
    };
    routeDataMap.set(menuItem.id, route);
    menuDataMap.set(menuItem.id, menuItem);
  }
  const routeData: WrapperRouteRecordStringComponent[] = [];

  for (const menuItem of menus) {
    if (!menuItem.id) continue;
    const currentRoute = routeDataMap.get(menuItem.id);
    const currentItem = menuDataMap.get(menuItem.id);
    if (menuItem.parentId) {
      const pRoute = routeDataMap.get(menuItem.parentId);
      const pItem = menuDataMap.get(menuItem.parentId);
      if (currentItem && currentRoute && pRoute && pItem) {
        if (pRoute.children && pItem.children) {
          pRoute.children.push(currentRoute);
          pItem.children.push(currentItem);
        } else {
          pItem.children = [currentItem];
          pRoute.children = [currentRoute];
        }
      }
    } else {
      if (currentRoute && currentItem) {
        routeData.push(currentRoute);
      }
    }
  }
  return routeData;
}

/**
 * 获取用户所有菜单
 */
export async function getAllMenusApi(): Promise<
  WrapperRouteRecordStringComponent[]
> {
  const data = await requestClient.get<MenuApi.MenuData[]>('/sys/menus/web');
  const target = formatMenuIds(...data);
  return generateTreeRoutes(target);
}

export async function filterMenusApi(params: MenuApi.MenuFilterParams) {
  const data = await requestClient.get<CommonPaginationData<MenuApi.MenuData>>(
    '/sys/menus/filter',
    { params },
  );
  data.items = formatMenuIds(...data.items);
  return data;
}

/**
 * 获取所有可配置菜单
 */
export async function getMenusApi(params: Partial<MenuApi.MenuData> = {}) {
  const data = await requestClient.get<MenuApi.MenuData[]>('/sys/menus', {
    params,
  });
  return formatMenuIds(...data);
}

export function formatMenuIds(...data: MenuApi.MenuData[]) {
  // vue-antd treeSelect 组件的 key 必须为 string 类型
  for (const item of data) {
    if (item.id) {
      item.id = item.id.toString();
    }
    if (item.parentId) {
      item.parentId = item.parentId.toString();
    }
  }
  return data;
}

export function createMenuApi(data: MenuApi.MenuData) {
  return requestClient.post<MenuApi.MenuData>('/sys/menus', data);
}

export function updateMenuApi(id: string, data: MenuApi.MenuData) {
  if (!Reflect.has(data, 'parentId') || isEmpty(data.parentId)) {
    data.parentId = '';
  }
  return requestClient.put<MenuApi.MenuData>(`/sys/menus/${id}`, data);
}

export function removeMenuApi(id: string) {
  return requestClient.delete(`/sys/menus/${id}`);
}
