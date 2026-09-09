# 管理后台资源页约定

`tpl-frontend` 的管理后台资源页默认使用 `useResourceGrid` 作为列表 Module。资源页只描述业务字段、列、权限和个性化动作，不在页面里重复拼接分页、工具栏、确认弹窗和成功提示。

## 列表页

优先使用 `useResourceGrid`：

```ts
const [Grid, gridApi] = useResourceGrid({
  formOptions,
  gridOptions,
  query: filterUsersApi,
});
```

`useResourceGrid` 默认提供：

- 搜索表单默认值：`collapsed: false`、`submitOnEnter: true`、`submitOnChange: false`。
- 表格默认值：`height: 'auto'`、`keepSource: true`、`exportConfig: {}`、`pagerConfig: {}`。
- 工具栏默认值：`custom`、`export`、`refresh`、`resizable`、`search`、`zoom`。
- 后端分页参数映射：`page.currentPage -> pageIndex`，`page.pageSize -> pageSize`。

需要非标准分页或查询参数时，使用 `mapQueryParams`：

```ts
const [Grid] = useResourceGrid({
  formOptions,
  gridOptions,
  mapQueryParams: ({ formValues, page }) => ({
    ...formValues,
    pageIndex: page.currentPage - 1,
    pageSize: page.pageSize,
  }),
  query: filterTasksApi,
});
```

只有在需要使用 Vxe 的底层能力，且 `useResourceGrid` 无法表达时，才直接使用 `useVbenVxeGrid`。

## 表格列

标签列统一用 `VxeUtils.tag.getColumn` 或 `VxeUtils.tags.getColumn`。不要在每个页面手写重复的 `Tag` slot。复杂单元格仍可通过 `slots.default` 定制，但应优先确认是否可以沉淀到 `VxeUtils`。

## 资源动作

新增、编辑等保存动作使用 `runResourceAction`：

```ts
await runResourceAction({
  action: () => updateUserApi(row.id, data),
  onSuccess: async () => {
    formModalClose();
    await gridApi.query();
  },
  successMessage: '修改成功',
});
```

删除、下线、启动、停止等确认动作使用 `confirmResourceAction`：

```ts
confirmResourceAction({
  action: () => removeUserApi(row.id),
  onSuccess: () => gridApi.query(),
  successMessage: '删除成功',
  title: '确认删除吗?',
});
```

页面不直接使用 `Modal.confirm` 和 `notification.success`，避免确认行为、loading、刷新顺序分散。

## 弹窗表单

通用弹窗使用 `BaseModal` / `useBaseModal`，表单弹窗使用 `useFormModal`。禁止使用含义模糊的临时命名来描述弹窗 Module。

`useFormModal` 负责：

- 克隆 `form-create` 规则，避免跨弹窗共享可变 rule。
- 管理 `confirmLoading`，防止重复提交。
- 在关闭时重置表单与弹窗状态。
- 通过 `onError` 暴露提交异常。

短期内，搜索表单使用 Vben Form，动态弹窗表单使用 `form-create`。新增简单 CRUD 表单时，应优先评估能否用 Vben Form；只有动态 schema 或历史兼容场景才继续使用 `form-create`。
