// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';

import { describe, expect, it } from 'vitest';

import CredentialTextFileInput from './CredentialTextFileInput.vue';

describe('credential text file input', () => {
  it('lets the user enter credential text directly', async () => {
    const wrapper = mount(CredentialTextFileInput, {
      props: {
        fileButtonLabel: '读取应用私钥',
        modelValue: '',
      },
    });

    await wrapper.get('textarea').setValue('pasted-private-key');

    expect(wrapper.emitted('update:modelValue')).toContainEqual([
      'pasted-private-key',
    ]);
  });

  it('reads a local file into the same credential value', async () => {
    const wrapper = mount(CredentialTextFileInput, {
      props: {
        accept: '.pem,.key,.txt',
        fileButtonLabel: '读取应用私钥',
        modelValue: '',
      },
    });
    const input = wrapper.get('input[type="file"]');
    const file = new File(['file-private-key'], 'private-key.pem', {
      type: 'text/plain',
    });
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    });

    await input.trigger('change');

    expect(input.attributes('accept')).toBe('.pem,.key,.txt');
    expect(wrapper.get('button').text()).toContain('读取应用私钥');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([
      'file-private-key',
    ]);
  });
});
