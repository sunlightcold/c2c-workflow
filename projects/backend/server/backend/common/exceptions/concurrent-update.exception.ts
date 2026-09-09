import { HttpException, HttpStatus } from '@nestjs/common'

export class ConcurrentUpdateException extends HttpException {
  constructor(message = 'Concurrent update error. Please try again.') {
    super(message, HttpStatus.CONFLICT)
  }
}
