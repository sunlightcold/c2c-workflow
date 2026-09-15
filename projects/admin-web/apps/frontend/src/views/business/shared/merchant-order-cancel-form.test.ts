/** @vitest-environment happy-dom */

import type { Api } from '@form-create/ant-design-vue';

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import FormCreate from '@form-create/ant-design-vue';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';

import { cancelMerchantOrderModalOptions } from './business-form-schemas';

describe('merchant order cancellation form', () => {
  it('accepts a reason entered in the textarea', async () => {
    const options = cancelMerchantOrderModalOptions();
    let api: Api | undefined;
    const wrapper = mount(FormCreate, {
      attachTo: document.body,
      global: { plugins: [Antd] },
      props: {
        ...options.formProps,
        'onUpdate:api': (value: Api) => {
          api = value;
        },
      },
    });
    await nextTick();

    await wrapper.get('textarea').setValue('作废');

    expect(api?.formData()).toMatchObject({ reason: '作废' });
    await expect(api?.validate()).resolves.toBe(true);
  });
});
