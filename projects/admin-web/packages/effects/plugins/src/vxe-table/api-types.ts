import type { Ref } from 'vue';

import type { VxeGridApi } from './api';
import type { VxeGridProps } from './types';

export type ExtendedVxeGridApi = VxeGridApi & {
  useStore: <T = NoInfer<VxeGridProps>>(
    selector?: (state: NoInfer<VxeGridProps>) => T,
  ) => Readonly<Ref<T>>;
};
