export class PaymentNotSubmittedError extends Error {
  constructor(
    message: string,
    readonly terminalOrder = false,
  ) {
    super(message)
    this.name = 'PaymentNotSubmittedError'
  }
}

/**
 * Raised when a batch item becomes terminally unavailable while the batch is
 * being claimed. The transaction is rolled back so the coordinator can prune
 * that item and claim the remaining orders without resubmitting anything.
 */
export class PaymentBatchClaimRejectionError extends Error {
  constructor(
    message: string,
    readonly paymentOrderId: string,
  ) {
    super(message)
    this.name = 'PaymentBatchClaimRejectionError'
  }
}

export class PlatformFundsExceptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlatformFundsExceptionError'
  }
}
