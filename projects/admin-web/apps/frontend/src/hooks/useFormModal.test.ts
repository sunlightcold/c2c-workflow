import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFormModal } from './useFormModal';

const modalMocks = vi.hoisted(() => ({
  close: vi.fn(),
  onClosed: vi.fn(),
  show: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./useBaseModal', () => ({
  useBaseModal: () => ({
    ...modalMocks,
    ModalRender: {},
  }),
}));

describe('useFormModal', () => {
  beforeEach(() => {
    Object.values(modalMocks).forEach((mock) => mock.mockReset());
  });

  it('keeps validation failures inside the modal interaction', async () => {
    const validationError = new Error('validation failed');
    const onError = vi.fn();
    const { formModalShow } = useFormModal();

    await formModalShow(
      { props: { title: '测试表单' } },
      {
        onError,
        onOk: async () => {
          throw validationError;
        },
      },
    );

    const modalOptions = modalMocks.show.mock.calls[0]?.[0];
    await expect(modalOptions.event.onOk()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(validationError, undefined);
    expect(modalMocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmLoading: false }),
    );
  });
});
