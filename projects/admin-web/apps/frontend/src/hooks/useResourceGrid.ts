import type { ModalFuncProps } from 'ant-design-vue';

import type { CommonPageParams } from '../../types/common';

import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { Modal, notification } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';

type SearchValues = Record<string, unknown>;

export interface ResourceGridQueryContext<
  TSearchValues extends SearchValues = SearchValues,
> {
  formValues: Partial<TSearchValues>;
  page: {
    currentPage: number;
    pageSize: number;
  };
}

export type ResourceGridQueryParams<
  TSearchValues extends SearchValues = SearchValues,
> = CommonPageParams & Partial<TSearchValues>;

export interface UseResourceGridOptions<
  TRow = unknown,
  TSearchValues extends SearchValues = SearchValues,
  TQueryParams extends
    CommonPageParams = ResourceGridQueryParams<TSearchValues>,
> {
  formOptions?: VbenFormProps;
  gridOptions: VxeTableGridOptions<TRow>;
  mapQueryParams?: (
    context: ResourceGridQueryContext<TSearchValues>,
  ) => TQueryParams;
  query?: (params: TQueryParams) => Promise<unknown>;
}

export interface ResourceActionOptions {
  action: () => Promise<unknown>;
  onSuccess?: () => Promise<void> | void;
  successMessage?: string;
}

export interface ConfirmResourceActionOptions
  extends Omit<ModalFuncProps, 'onOk'>,
    ResourceActionOptions {
  title: ModalFuncProps['title'];
}

const defaultToolbarConfig: VxeTableGridOptions['toolbarConfig'] = {
  custom: true,
  export: true,
  refresh: true,
  resizable: true,
  search: true,
  zoom: true,
};

export function createSearchFormOptions(
  formOptions?: VbenFormProps,
): undefined | VbenFormProps {
  if (!formOptions) {
    return undefined;
  }

  return {
    collapsed: false,
    showCollapseButton: true,
    submitOnChange: false,
    submitOnEnter: true,
    ...formOptions,
  };
}

export function runResourceAction(options: ResourceActionOptions) {
  return Promise.resolve()
    .then(options.action)
    .then(async () => {
      if (options.successMessage) {
        notification.success({ message: options.successMessage });
      }
      await options.onSuccess?.();
    });
}

export function confirmResourceAction(options: ConfirmResourceActionOptions) {
  const {
    action,
    centered = true,
    onSuccess,
    successMessage,
    ...modalOptions
  } = options;

  Modal.confirm({
    centered,
    ...modalOptions,
    async onOk() {
      await runResourceAction({ action, onSuccess, successMessage });
    },
  });
}

export function createResourceGridOptions<
  TRow = unknown,
  TSearchValues extends SearchValues = SearchValues,
  TQueryParams extends
    CommonPageParams = ResourceGridQueryParams<TSearchValues>,
>(
  options: UseResourceGridOptions<TRow, TSearchValues, TQueryParams>,
): VxeTableGridOptions<TRow> {
  const { gridOptions, mapQueryParams, query } = options;
  const proxyConfig = gridOptions.proxyConfig ?? {};
  const proxyAjax = proxyConfig.ajax ?? {};

  return {
    exportConfig: {},
    height: 'auto',
    keepSource: true,
    pagerConfig: {},
    ...gridOptions,
    toolbarConfig: {
      ...defaultToolbarConfig,
      ...gridOptions.toolbarConfig,
    },
    ...(query
      ? {
          proxyConfig: {
            ...proxyConfig,
            ajax: {
              ...proxyAjax,
              query: async (
                params: { page: ResourceGridQueryContext['page'] },
                formValues: Partial<TSearchValues> = {},
              ) => {
                const queryParams = mapQueryParams
                  ? mapQueryParams({ formValues, page: params.page })
                  : ({
                      ...formValues,
                      pageIndex: params.page.currentPage,
                      pageSize: params.page.pageSize,
                    } as unknown as TQueryParams);

                return await query(queryParams);
              },
            },
          },
        }
      : {}),
  };
}

export function useResourceGrid<
  TRow = unknown,
  TSearchValues extends SearchValues = SearchValues,
  TQueryParams extends
    CommonPageParams = ResourceGridQueryParams<TSearchValues>,
>(options: UseResourceGridOptions<TRow, TSearchValues, TQueryParams>) {
  const [Grid, gridApi] = useVbenVxeGrid({
    formOptions: createSearchFormOptions(options.formOptions),
    gridOptions: createResourceGridOptions(options),
  });

  return [Grid, gridApi] as const;
}
