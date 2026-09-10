export class AlipayApiError extends Error {
  constructor(
    readonly code: string,
    readonly subCode: string,
    message: string,
    readonly subMessage: string,
  ) {
    super(message)
  }
}

export function invalidArgument(subMessage: string) {
  return new AlipayApiError('40002', 'isv.invalid-parameter', 'Invalid Arguments', subMessage)
}
