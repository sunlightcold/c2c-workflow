export enum CommonStatusEnum {
  Start = 1,
  Stop = 0,
}

export const CommonStatusMap: Record<CommonStatusEnum, string> = {
  [CommonStatusEnum.Start]: '启用',
  [CommonStatusEnum.Stop]: '停用',
};

export const CommonStatusMap2: Record<CommonStatusEnum, string> = {
  [CommonStatusEnum.Start]: '成功',
  [CommonStatusEnum.Stop]: '失败',
};

export const CommonStatusOptions: { label: string; value: number }[] = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

export const CommonStatusOptions2: { label: string; value: number }[] = [
  { label: '是', value: 1 },
  { label: '否', value: 0 },
];

export const CommonStatusOptions3: { label: string; value: number }[] = [
  { label: '成功', value: 1 },
  { label: '失败', value: 0 },
];

export enum ParamsTypeEnum {
  Normal = 2,
  System = 1,
}

export const ParamsTypeOptions: { label: string; value: ParamsTypeEnum }[] = [
  { label: '系统变量', value: ParamsTypeEnum.System },
  { label: '通用变量', value: ParamsTypeEnum.Normal },
];

export const ParamsTypeMap: Record<ParamsTypeEnum, string> = {
  [ParamsTypeEnum.Normal]: '通用变量',
  [ParamsTypeEnum.System]: '系统变量',
};
