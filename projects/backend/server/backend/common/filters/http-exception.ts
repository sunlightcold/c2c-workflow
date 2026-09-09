import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import { Request, Response } from 'express'
import requestIp from 'request-ip'
import { ResponseModel } from '../models'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const clientIp = requestIp.getClientIp(request) || 'unknown'

    const status = exception.getStatus()
    let msg = exception.message ?? exception.name

    if (exception instanceof ThrottlerException) {
      msg = '请求过于频繁，请稍后再试'
    }
    this.logger.log('----------------- exception.stack -----------------')
    this.logger.warn(`请求IP: ${clientIp}`)
    this.logger.error(exception.message, exception.stack)
    this.logger.log('----------------- exception.stack -----------------')
    response.status(status).json(ResponseModel.error(status, msg).setPath(request.url))
  }
}
