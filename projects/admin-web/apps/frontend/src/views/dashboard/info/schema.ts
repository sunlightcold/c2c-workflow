import type { Rule } from '@form-create/ant-design-vue';

import type { FormModalOptions } from '#/hooks';

import { $t } from '@vben/locales';

const PASSWORD_MIN_LENGTH = 6;

export const modifyPwdModalOptions: FormModalOptions = {
  props: { title: $t('authentication.modifyPassword'), centered: true },
  formProps: {
    rule: [
      {
        type: 'input',
        field: 'oldPwd',
        title: $t('authentication.oldPassword'),
        value: '',
        col: { span: 24 },
        props: { type: 'password' },
        validate: [
          {
            required: true,
            message: $t('authentication.oldPasswordTip'),
            trigger: 'blur',
          },
          {
            min: PASSWORD_MIN_LENGTH,
            message: $t('authentication.passwordMinLengthTip', [
              PASSWORD_MIN_LENGTH,
            ]),
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input',
        field: 'newPwd',
        title: $t('authentication.newPassword'),
        value: '',
        col: { span: 24 },
        props: { type: 'password' },
        validate: [
          {
            required: true,
            message: $t('authentication.newPasswordTip'),
            trigger: 'blur',
          },
          {
            min: PASSWORD_MIN_LENGTH,
            message: $t('authentication.passwordMinLengthTip', [
              PASSWORD_MIN_LENGTH,
            ]),
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input',
        field: 'confirmPwd',
        title: $t('authentication.confirmPassword'),
        value: '',
        col: { span: 24 },
        props: { type: 'password' },
        validate: [
          {
            min: PASSWORD_MIN_LENGTH,
            message: $t('authentication.passwordMinLengthTip', [
              PASSWORD_MIN_LENGTH,
            ]),
            trigger: 'blur',
          },
          {
            required: true,
            validator(_rule: Rule, val: string, callback: (val?: any) => void) {
              const api = (this as unknown as any).api;
              const newPwd = api.getValue('newPwd');
              if (val === newPwd) {
                callback();
              } else {
                callback(
                  new Error($t('authentication.confirmPasswordMismatch')),
                );
              }
            },
          },
        ],
      },
      {
        type: 'input',
        field: 'code',
        title: $t('authentication.code'),
        value: '',
        col: { span: 24 },
        props: { placeholder: $t('authentication.otpUnboundNotRequired') },
      },
    ],
    option: {
      submitBtn: false,
      form: { layout: 'vertical' },
      appendValue: false,
    },
  },
};
