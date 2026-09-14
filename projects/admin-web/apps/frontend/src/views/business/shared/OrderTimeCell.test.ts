// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';

import { describe, expect, it } from 'vitest';

import OrderTimeCell from './OrderTimeCell.vue';

const ATagStub = {
  props: ['color'],
  template: '<span class="ant-tag"><slot /></span>',
};

describe('order time cell', () => {
  it('stacks creation and end times with the expected labels', () => {
    const wrapper = mount(OrderTimeCell, {
      global: { stubs: { ATag: ATagStub } },
      props: {
        createdAt: '2026-09-14 21:10:47',
        endedAt: '2026-09-14 21:11:59',
      },
    });

    expect(wrapper.findAll('.ant-tag').map((tag) => tag.text())).toEqual([
      '创建',
      '结束',
    ]);
    expect(wrapper.text()).toContain('2026-09-14 21:10:47');
    expect(wrapper.text()).toContain('2026-09-14 21:11:59');
  });

  it('shows a placeholder when an order has not ended', () => {
    const wrapper = mount(OrderTimeCell, {
      global: { stubs: { ATag: ATagStub } },
      props: { createdAt: '2026-09-14 21:10:47' },
    });

    expect(wrapper.text()).toContain('结束-');
  });
});
