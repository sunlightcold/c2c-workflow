import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { ResponseModel } from '../models'

import { SetMetadata } from '@nestjs/common'

export const SKIP_RESPONSE_INTERCEPTOR = 'SKIP_RESPONSE_INTERCEPTOR'
export const SkipResponseInterceptor = () => SetMetadata(SKIP_RESPONSE_INTERCEPTOR, true)

@Injectable()
export class ResponseInterceptor<T = any> implements NestInterceptor<T, ResponseModel<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseModel<T>> {
    let shouldSkip = Reflect.getMetadata(SKIP_RESPONSE_INTERCEPTOR, context.getHandler())
    if (shouldSkip) {
      return next.handle()
    }
    shouldSkip = Reflect.getMetadata(SKIP_RESPONSE_INTERCEPTOR, context.getClass())
    if (shouldSkip) {
      return next.handle()
    }

    return next.handle().pipe(
      map((data) => {
        if (data instanceof ResponseModel) {
          return data as ResponseModel<T>
        }
        return ResponseModel.success<T>(data)
      }),
    )
  }
}
