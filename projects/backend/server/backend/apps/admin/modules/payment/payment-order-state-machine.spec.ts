import {
  assertPaymentOrderTransition,
  PaymentOrderState,
  PaymentOrderStateMachine,
} from './payment-order-state-machine'

describe('PaymentOrderStateMachine', () => {
  const machine = new PaymentOrderStateMachine()

  it('keeps platform confirmation outside the payment status machine', () => {
    expect(machine.transition(PaymentOrderState.READY, PaymentOrderState.SUBMITTING)).toBe(
      PaymentOrderState.SUBMITTING,
    )
    expect(machine.transition(PaymentOrderState.SUBMITTING, PaymentOrderState.SUCCESS)).toBe(
      PaymentOrderState.SUCCESS,
    )
    expect(() =>
      machine.transition(PaymentOrderState.SUCCESS, PaymentOrderState.PLATFORM_CONFIRM_PENDING),
    ).toThrow('非法支付状态迁移')
  })

  it('allows UNKNOWN to be resolved by query but never resubmitted', () => {
    expect(machine.transition(PaymentOrderState.SUBMITTING, PaymentOrderState.UNKNOWN)).toBe(
      PaymentOrderState.UNKNOWN,
    )
    expect(() =>
      machine.transition(PaymentOrderState.UNKNOWN, PaymentOrderState.SUBMITTING),
    ).toThrow('非法支付状态迁移')
    expect(machine.transition(PaymentOrderState.UNKNOWN, PaymentOrderState.SUCCESS)).toBe(
      PaymentOrderState.SUCCESS,
    )
  })

  it('does not allow a successful payment to return to submission', () => {
    expect(() =>
      machine.transition(PaymentOrderState.SUCCESS, PaymentOrderState.SUBMITTING),
    ).toThrow('非法支付状态迁移')
  })

  it('exposes the same transition guard to persistence adapters', () => {
    expect(() =>
      assertPaymentOrderTransition(PaymentOrderState.READY, PaymentOrderState.COMPLETED),
    ).toThrow('非法支付状态迁移: READY -> COMPLETED')
  })
})
