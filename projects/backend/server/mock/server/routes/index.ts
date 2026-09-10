export default defineEventHandler(() => ({
  name: 'to-pay upstream mock',
  health: '/api/mock/health',
  alipayBatchConfig: '/api/mock/alipay-batch/config',
  alipayGateway: '/api/alipay/gateway',
  binanceC2cGateway: '/sapi/v1/c2c/orderMatch',
  binanceC2cConfig: '/api/mock/binance-c2c/config',
  okxC2cGateway: '/v4/c2c/order/getOrderList',
  okxC2cConfig: '/api/mock/okx-c2c/config',
}))
