import type { ModalProps } from 'ant-design-vue';

import type { Slots, VNode } from 'vue';

import { defineComponent, h, ref } from 'vue';

import { BaseModal } from '#/components/base-modal';

type ModalSlots = {
  cancelText?: () => VNode;
  closeIcon?: () => VNode;
  default?: () => VNode;
  footer?: () => VNode;
  okText?: () => VNode;
  title?: () => VNode;
};

export interface BaseModalOptions {
  event?: Pick<ModalProps, 'onCancel' | 'onOk'>;
  props: Omit<ModalProps, 'onCancel' | 'onOk'>;
  slots?: ModalSlots;
}

export function useBaseModal() {
  const open = ref(false);
  const modalRef = ref<typeof BaseModal>();
  const props = ref<ModalProps>({});
  const event = ref<BaseModalOptions['event']>({});
  const slots = ref<ModalSlots>();
  const cleanupAfterClose = ref<(() => void) | undefined>();

  function resetModalState() {
    props.value = {};
    event.value = {};
    slots.value = undefined;
    cleanupAfterClose.value = undefined;
  }

  function handleAfterClose() {
    if (open.value) {
      return;
    }
    props.value.afterClose?.();
    cleanupAfterClose.value?.();
    resetModalState();
  }

  const ModalRender = defineComponent(() => {
    return () =>
      h(
        BaseModal,
        {
          modelValue: open.value,
          'onUpdate:modelValue': (value: boolean) => (open.value = value),
          ref: modalRef,
          ...props.value,
          afterClose: handleAfterClose,
          ...event.value,
        },
        slots.value,
      );
  });

  const show = async (options: BaseModalOptions) => {
    resetModalState();
    props.value = { ...options.props };
    event.value = options.event ? { ...options.event } : {};
    slots.value = options.slots as Slots;
    open.value = true;
  };

  const close = () => {
    open.value = false;
  };

  const onClosed = (cleanup: () => void) => {
    cleanupAfterClose.value = cleanup;
  };

  const update = (nextProps: ModalProps) => {
    props.value = { ...props.value, ...nextProps };
  };

  return { close, modalRef, ModalRender, onClosed, open, show, update };
}
