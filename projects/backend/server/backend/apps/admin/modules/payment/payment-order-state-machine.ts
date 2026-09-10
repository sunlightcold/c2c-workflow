import { Injectable } from '@nestjs/common'
import { PaymentOrderStatus } from '@admin/database'

export const PaymentOrderState = PaymentOrderStatus
export type PaymentOrderState = PaymentOrderStatus

const transitions: Record<PaymentOrderState, readonly PaymentOrderState[]> = {
  [PaymentOrderState.PENDING_CONFIG]: [PaymentOrderState.READY, PaymentOrderState.CANCELLED],
  [PaymentOrderState.CREATED]: [PaymentOrderState.READY, PaymentOrderState.CANCELLED],
  [PaymentOrderState.READY]: [PaymentOrderState.SUBMITTING, PaymentOrderState.CANCELLED],
  [PaymentOrderState.SUBMITTING]: [
    PaymentOrderState.PROCESSING,
    PaymentOrderState.UNKNOWN,
    PaymentOrderState.SUCCESS,
    PaymentOrderState.FAILED,
  ],
  [PaymentOrderState.PROCESSING]: [
    PaymentOrderState.PROCESSING,
    PaymentOrderState.UNKNOWN,
    PaymentOrderState.SUCCESS,
    PaymentOrderState.FAILED,
  ],
  [PaymentOrderState.UNKNOWN]: [
    PaymentOrderState.PROCESSING,
    PaymentOrderState.UNKNOWN,
    PaymentOrderState.SUCCESS,
    PaymentOrderState.FAILED,
  ],
  [PaymentOrderState.SUCCESS]: [
    PaymentOrderState.PLATFORM_CONFIRM_PENDING,
    PaymentOrderState.FUND_EXCEPTION,
  ],
  [PaymentOrderState.PLATFORM_CONFIRM_PENDING]: [
    PaymentOrderState.PLATFORM_CONFIRM_PENDING,
    PaymentOrderState.COMPLETED,
    PaymentOrderState.FUND_EXCEPTION,
  ],
  [PaymentOrderState.FAILED]: [],
  [PaymentOrderState.CANCELLED]: [],
  [PaymentOrderState.COMPLETED]: [],
  [PaymentOrderState.FUND_EXCEPTION]: [],
}

export function assertPaymentOrderTransition(
  current: PaymentOrderState,
  next: PaymentOrderState,
): void {
  if (!transitions[current].includes(next))
    throw new Error(`非法支付状态迁移: ${current} -> ${next}`)
}

@Injectable()
export class PaymentOrderStateMachine {
  transition(current: PaymentOrderState, next: PaymentOrderState): PaymentOrderState {
    assertPaymentOrderTransition(current, next)
    return next
  }
}
