import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmResourceAction,
  createResourceGridOptions,
  createSearchFormOptions,
  runResourceAction,
} from './useResourceGrid';

const modalMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
}));

vi.mock('ant-design-vue', () => ({
  Modal: {
    confirm: modalMocks.confirm,
  },
  notification: {
    success: modalMocks.success,
  },
}));

vi.mock('#/adapter/vxe-table', () => ({
  useVbenVxeGrid: vi.fn(),
}));

describe('useResourceGrid', () => {
  beforeEach(() => {
    modalMocks.confirm.mockReset();
    modalMocks.success.mockReset();
  });

  it('merges enterprise search form defaults while keeping page overrides', () => {
    expect(
      createSearchFormOptions({
        schema: [],
        showCollapseButton: false,
      }),
    ).toMatchObject({
      collapsed: false,
      schema: [],
      showCollapseButton: false,
      submitOnChange: false,
      submitOnEnter: true,
    });
  });

  it('builds resource grid defaults and maps vxe pagination to backend params', async () => {
    const query = vi.fn().mockResolvedValue({ items: [] });
    const gridOptions = createResourceGridOptions({
      gridOptions: {
        columns: [{ field: 'name', title: 'Name' }],
        toolbarConfig: {
          export: false,
        },
      },
      query,
    });

    await gridOptions.proxyConfig?.ajax?.query?.(
      { page: { currentPage: 2, pageSize: 50, total: 0 } } as any,
      { name: 'alice' },
    );

    expect(gridOptions).toMatchObject({
      exportConfig: {},
      height: 'auto',
      keepSource: true,
      pagerConfig: {},
      toolbarConfig: {
        custom: true,
        export: false,
        refresh: true,
        resizable: true,
        search: true,
        zoom: true,
      },
    });
    expect(query).toHaveBeenCalledWith({
      name: 'alice',
      pageIndex: 2,
      pageSize: 50,
    });
  });

  it('supports custom query param mapping for non-standard resources', async () => {
    const query = vi.fn().mockResolvedValue({ items: [] });
    const gridOptions = createResourceGridOptions({
      gridOptions: { columns: [] },
      mapQueryParams: ({ formValues, page }) => ({
        keyword: formValues.keyword,
        pageIndex: page.currentPage - 1,
        pageSize: page.pageSize,
      }),
      query,
    });

    await gridOptions.proxyConfig?.ajax?.query?.(
      { page: { currentPage: 3, pageSize: 20, total: 0 } } as any,
      { keyword: 'job' },
    );

    expect(query).toHaveBeenCalledWith({
      keyword: 'job',
      pageIndex: 2,
      pageSize: 20,
    });
  });

  it('runs action success notification before the success callback', async () => {
    const calls: string[] = [];

    await runResourceAction({
      action: async () => {
        calls.push('action');
      },
      onSuccess: async () => {
        calls.push('success');
      },
      successMessage: '保存成功',
    });

    expect(modalMocks.success).toHaveBeenCalledWith({ message: '保存成功' });
    expect(calls).toEqual(['action', 'success']);
  });

  it('wraps confirmed actions with centered modal defaults', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn().mockResolvedValue(undefined);

    confirmResourceAction({
      action,
      onSuccess,
      successMessage: '删除成功',
      title: '确认删除吗?',
    });

    expect(modalMocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        centered: true,
        title: '确认删除吗?',
      }),
    );

    const [modalOptions] = modalMocks.confirm.mock.calls[0] ?? [];
    await modalOptions.onOk();

    expect(action).toHaveBeenCalled();
    expect(modalMocks.success).toHaveBeenCalledWith({ message: '删除成功' });
    expect(onSuccess).toHaveBeenCalled();
  });
});
