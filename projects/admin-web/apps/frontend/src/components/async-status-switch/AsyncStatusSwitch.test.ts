// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import AsyncStatusSwitch from './index.vue';

function deferred() {
  let reject!: (reason?: unknown) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('async status switch', () => {
  it('submits the target state once and shows loading until it completes', async () => {
    const pending = deferred();
    const request = vi.fn(() => pending.promise);
    const wrapper = mount(AsyncStatusSwitch, {
      props: {
        checked: false,
        label: '商家账号状态',
        request,
      },
    });

    await wrapper.get('button').trigger('click');

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(true);
    expect(wrapper.get('button').classes()).toContain('ant-switch-loading');

    pending.resolve();
    await pending.promise;
    await wrapper.vm.$nextTick();

    expect(wrapper.get('button').classes()).not.toContain('ant-switch-loading');
  });

  it('keeps the controlled state unchanged when the request fails', async () => {
    const pending = deferred();
    const wrapper = mount(AsyncStatusSwitch, {
      props: {
        checked: true,
        label: '支付账号状态',
        request: () => pending.promise,
      },
    });

    await wrapper.get('button').trigger('click');
    pending.reject(new Error('request failed'));
    await pending.promise.catch(() => undefined);
    await wrapper.vm.$nextTick();

    expect(wrapper.get('button').attributes('aria-checked')).toBe('true');
  });

  it('does not submit while disabled', async () => {
    const request = vi.fn();
    const wrapper = mount(AsyncStatusSwitch, {
      props: {
        checked: true,
        disabled: true,
        label: '固定经营单位状态',
        request,
      },
    });

    await wrapper.get('button').trigger('click');

    expect(request).not.toHaveBeenCalled();
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });
});
