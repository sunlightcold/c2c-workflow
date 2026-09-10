export class PaymentNotSubmittedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentNotSubmittedError'
  }
}

export class PlatformFundsExceptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlatformFundsExceptionError'
  }
}
