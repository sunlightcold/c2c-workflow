import type { ImageProps, InputProps } from 'ant-design-vue';

export interface GraphicCaptcheProps {
  inputProps: Omit<InputProps, 'value'>;
  imgProps: ImageProps;
}
