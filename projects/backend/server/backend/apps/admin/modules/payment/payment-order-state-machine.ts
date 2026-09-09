import { Injectable } from '@nestjs/common'

export enum PaymentOrderState {
  CREATED = 'CREATED',
  READY = 'READY',
  SUBMITTING = 'SUBMITTING',
  PROCESSING = 'PROCESSING',
  UNKNOWN = 'UNKNOWN',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PLATFORM_CONFIRM_PENDING = 'PLATFORM_CONFIRM_PENDING',
  COMPLETED = 'COMPLETED',
  FUND_EXCEPTION = 'FUND_EXCEPTION',
}

const transitions: Record<PaymentOrderState, readonly PaymentOrderState[]> = {
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

@Injectable()
export class PaymentOrderStateMachine {
  transition(current: PaymentOrderState, next: PaymentOrderState): PaymentOrderState {
    if (!transitions[current].includes(next))
      throw new Error(`非法支付状态迁移: ${current} -> ${next}`)
    return next
  }
}
