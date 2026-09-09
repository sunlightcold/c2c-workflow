import type { Ref } from 'vue';

import type { FormApi } from './form-api';
import type { VbenFormProps } from './types';

export type ExtendedFormApi = FormApi & {
  useStore: <T = NoInfer<VbenFormProps>>(
    selector?: (state: NoInfer<VbenFormProps>) => T,
  ) => Readonly<Ref<T>>;
};
