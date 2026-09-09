<script lang="ts" setup>
import type { ModalProps } from 'ant-design-vue';

import { Modal } from 'ant-design-vue';
import { omit } from 'lodash-es';

const props = defineProps<Omit<ModalProps, 'visible'>>();
const emit = defineEmits(['ok', 'cancel']);
const openModel = defineModel<boolean>({ required: true });
</script>

<template>
  <Modal
    v-bind="omit(props, ['open', 'onCancel', 'onOk', 'onUpdate:open'])"
    v-model:open="openModel"
    :destroy-on-close="props.destroyOnClose ?? true"
    :mask="true"
    :mask-closable="props.maskClosable ?? false"
    :width="props.width ?? 640"
    @ok="emit('ok')"
    @cancel="emit('cancel')"
  >
    <slot></slot>
  </Modal>
</template>
