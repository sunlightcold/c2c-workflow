import type { BasicUserInfo } from '@vben/types';

export interface Props {
  userInfo: BasicUserInfo | null;
  tabs: {
    description?: string;
    label: string;
    value: string;
  }[];
}
