import { theme } from 'ant-design-vue';

const { defaultAlgorithm, defaultSeed } = theme;

const mapToken = defaultAlgorithm(defaultSeed);

export const AntColorVar = {
  error: mapToken.colorError,
  info: mapToken.colorInfo,
  primary: mapToken.colorPrimary,
  success: mapToken.colorSuccess,
  warning: mapToken.colorWarning,
};
