import { handleAlipayGateway } from '@mock/core/alipay-gateway'

export default defineEventHandler((event) => handleAlipayGateway(event, 'alipay.data.bill.ereceipt.query'))
