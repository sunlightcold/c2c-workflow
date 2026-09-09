import type {
  QRCodeErrorCorrectionLevel,
  QRCodeMaskPattern,
  QRCodeSegment,
  QRCodeToDataURLOptions,
  QRCodeToDataURLOptionsJpegWebp,
  QRCodeToSJISFunc,
} from 'qrcode';

import type { PropType } from 'vue';

import { defineComponent, h, ref, watch } from 'vue';

import { isEmpty } from '@vben/utils';

import QRCode from 'qrcode';

export const LEVELS = [
  'low',
  'medium',
  'quartile',
  'high',
  'L',
  'M',
  'Q',
  'H',
] as const;

export const MASK_PATTERNS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export const MODES = ['alphanumeric', 'numeric', 'kanji', 'byte'] as const;

export type { QRCodeSegment } from 'qrcode';

export type QRCodeValue = QRCodeSegment[] | string;

export const TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type QRCodeProps = Omit<QRCodeToDataURLOptions, 'renderOptions'> &
  QRCodeToDataURLOptionsJpegWebp['rendererOpts'] & {
    value: QRCodeValue;
  };

const MAX_QR_VERSION = 40;

export default defineComponent({
  props: {
    version: {
      type: Number,
      validator: (version: number) =>
        version === Number.parseInt(String(version), 10) &&
        version >= 1 &&
        version <= MAX_QR_VERSION,
    },
    errorCorrectionLevel: {
      type: String as PropType<QRCodeErrorCorrectionLevel>,
      validator: (level: QRCodeErrorCorrectionLevel) => LEVELS.includes(level),
    },
    maskPattern: {
      type: Number as PropType<QRCodeMaskPattern>,
      validator: (maskPattern: QRCodeMaskPattern) =>
        MASK_PATTERNS.includes(maskPattern),
    },
    toSJISFunc: Function as PropType<QRCodeToSJISFunc>,
    margin: Number,
    scale: Number,
    width: Number,
    color: {
      type: Object,
      validator: (color: QRCodeProps['color']) =>
        (['dark', 'light'] as const).every((c) =>
          ['string', 'undefined'].includes(typeof color?.[c]),
        ),
    },
    type: {
      type: String as PropType<QRCodeProps['type']>,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      validator: (type: QRCodeProps['type']) => TYPES.includes(type!),
    },
    quality: {
      type: Number,
      validator: (quality: number) =>
        quality === Number.parseFloat(String(quality)) &&
        quality >= 0 &&
        quality <= 1,
      required: false,
    },
    value: {
      type: [String, Array] as PropType<QRCodeValue>,
      required: true,
      validator(value: QRCodeValue) {
        if (typeof value === 'string') {
          return true;
        }
        return value.every(
          (it) =>
            typeof it.data === 'string' &&
            'mode' in it &&
            it.mode &&
            MODES.includes(it.mode),
        );
      },
    },
  },
  setup(props, { attrs, emit }) {
    const dataUrlRef = ref<string>();

    const toDataURL = () => {
      const { quality, value, ...rest } = props;
      QRCode.toDataURL(
        value,
        Object.assign(rest, isEmpty(quality) || { renderOptions: { quality } }),
      )
        .then((dataUrl) => {
          dataUrlRef.value = dataUrl;
          emit('change', dataUrl);
        })
        .catch((error: unknown) => emit('error', error));
    };

    watch(props, toDataURL, { immediate: true });

    return () =>
      h('img', {
        ...attrs,
        src: dataUrlRef.value,
      });
  },
});
