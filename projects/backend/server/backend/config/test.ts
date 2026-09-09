import developmentConfig from './development'

export default {
  ...developmentConfig,
  common: {
    ...developmentConfig.common,
    env: 'test',
  },
}
