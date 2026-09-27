import { MerchantOrderStatus } from '@admin/database'

/**
 * These statuses cannot be used for a new payment attempt, even though some
 * of them are still active in the merchant-order lifecycle. The payment order
 * can be removed from a READY batch, but the merchant order must remain
 * untouched because another payment flow or the platform confirmation flow
 * owns it.
 */
const MERCHANT_ORDER_UNAVAILABLE_FOR_PAYMENT = new Set<MerchantOrderStatus>([
  MerchantOrderStatus.PAYMENT_PROCESSING,
  MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
  MerchantOrderStatus.PENDING_RELEASE,
  MerchantOrderStatus.COMPLETED,
  MerchantOrderStatus.CANCELLED,
  MerchantOrderStatus.EXPIRED,
  MerchantOrderStatus.DISPUTED,
  MerchantOrderStatus.FUNDS_EXCEPTION,
])

export function isMerchantOrderUnavailableForPayment(status: MerchantOrderStatus): boolean {
  return MERCHANT_ORDER_UNAVAILABLE_FOR_PAYMENT.has(status)
}
