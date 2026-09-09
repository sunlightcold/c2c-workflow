import type { Api, Options, Rule } from '@form-create/ant-design-vue';

import type { BaseModalOptions } from './useBaseModal';

import { h, nextTick, ref } from 'vue';

import FormCreate from '@form-create/ant-design-vue';

import { useBaseModal } from './useBaseModal';

export interface FormEvent {
  onCancel?: (api: Api) => void;
  onError?: (error: unknown, api: Api) => void;
  onOk?: (api: Api) => void;
}

export interface FormProps {
  option?: Options;
  rule?: Rule[];
}

export interface FormModalOptions extends Omit<BaseModalOptions, 'event'> {
  formProps?: FormProps;
}

export function useFormModal() {
  const fApi = ref<Api>();
  const formProps = ref<FormProps>({});
  const modalProps = ref<BaseModalOptions['props']>({});
  const {
    close,
    ModalRender: FormModalRender,
    onClosed,
    show,
    update,
  } = useBaseModal();

  function resetFormModalState() {
    fApi.value?.resetFields();
    modalProps.value = {};
    formProps.value = {};
  }

  const formModalShow = async (
    options: FormModalOptions,
    formEvent?: FormEvent,
  ) => {
    fApi.value?.resetFields();
    modalProps.value = {
      ...options.props,
      confirmLoading: false,
    };
    formProps.value = options.formProps
      ? {
          ...options.formProps,
          rule: options.formProps.rule
            ? (FormCreate.copyRules(options.formProps.rule as Rule[]) as any)
            : undefined,
        }
      : {};

    show({
      event: {
        onCancel: () => {
          formEvent?.onCancel?.(fApi.value as Api);
          formModalClose();
        },
        onOk: async () => {
          if (modalProps.value?.confirmLoading) {
            return;
          }
          modalProps.value = { ...modalProps.value, confirmLoading: true };
          update(modalProps.value);
          try {
            await formEvent?.onOk?.(fApi.value as Api);
          } catch (error) {
            formEvent?.onError?.(error, fApi.value as Api);
            throw error;
          } finally {
            modalProps.value = { ...modalProps.value, confirmLoading: false };
            update(modalProps.value);
          }
        },
      },
      props: modalProps.value,
      slots: {
        default: () =>
          h(FormCreate, {
            api: fApi,
            'onUpdate:api': (api: Api) => (fApi.value = api),
            ...formProps.value,
          }),
      },
    });
    await nextTick();
    return [fApi.value] as const;
  };

  const formModalClose = () => {
    onClosed(resetFormModalState);
    close();
  };

  return { formModalClose, FormModalRender, formModalShow };
}
