import type { Api, Options } from '@form-create/ant-design-vue';
import type {
  ApiAttrs,
  OptionAttrs,
  RuleAttrs,
} from '@form-create/ant-design-vue/types/config';
import type { Rule } from '@form-create/core';

import type { Ref } from 'vue';

import { defineComponent, h, ref } from 'vue';

import FormCreate from '@form-create/ant-design-vue';

/**
 * 直接使用 @form-create/ant-design-vue 导出的 Rule 类型会报错，原因是 Rule 泛型第二个参数导致，
 * 这里设置为 any，暂时找到合适的解决方案
 */
export interface FormCreateProps {
  option: Options;
  rule: Rule<OptionAttrs, any, RuleAttrs, ApiAttrs>[];
}

export function useFormCreate(props: FormCreateProps) {
  const fApi = ref<Api>();

  const FormRender = defineComponent(() => {
    return () =>
      h(FormCreate, {
        api: fApi,
        'onUpdate:api': (api: Api) => (fApi.value = api),
        ...props,
      });
  });

  return [FormRender, fApi as Ref<Api>] as const;
}
