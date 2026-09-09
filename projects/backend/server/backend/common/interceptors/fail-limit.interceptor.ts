import { CacheService } from '@admin/modules/cache'
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, from, of, switchMap, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { FAIL_LIMIT_KEY, FailLimitOptions } from '../decorators/fail-limit.decorator'

@Injectable()
export class FailLimitInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const options = this.reflector.get<FailLimitOptions>(FAIL_LIMIT_KEY, context.getHandler())

    if (!options) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest()

    let account = ''
    if (options.keyField) {
      account = request.body[options.keyField]
    }

    if (options.enableIp) {
      const ip = request.clientInfo?.ip || request.ip || ''
      if (ip) {
        account = account ? `${account}:${ip}` : ip
      }
    }

    if (!account) {
      return next.handle()
    }

    // 1. Pre-check: is the account already locked?
    const currentAttempts = await this.cacheService.getFailAttempts(options.prefix, account)
    if (currentAttempts >= options.maxCount) {
      throw new ForbiddenException(this.buildLockMessage(options))
    }

    // 2. Wrap the handler
    return next.handle().pipe(
      // On success: clear the failure counter (awaited via switchMap)
      switchMap((data) =>
        from(this.cacheService.clearFailAttempts(options.prefix, account)).pipe(
          switchMap(() => of(data)),
        ),
      ),

      // On error: check if it should be counted as a failure
      catchError((err: unknown) => {
        if (!this.shouldCountAsFailure(err, options)) {
          return throwError(() => err)
        }

        // Increment counter and decide the response
        return from(
          this.cacheService.incrementFailAttempt({
            prefix: options.prefix,
            account,
            ttl: options.lockTime,
            maxCount: options.maxCount,
          }),
        ).pipe(
          // If Redis itself fails, fall back to throwing the original error
          // Must be BEFORE switchMap so it only catches Redis errors
          catchError(() => throwError(() => err)),
          switchMap((newCount) => {
            const remainCount = Math.max(0, options.maxCount - newCount)

            // Reached the limit → throw lock message
            if (newCount >= options.maxCount) {
              return throwError(() => new ForbiddenException(this.buildLockMessage(options)))
            }

            // Not yet locked → append warning to the original error
            const warnMessage = this.buildWarnMessage(remainCount, options)
            const originalMessage = this.getErrorMessage(err)

            return throwError(() => new BadRequestException(`${originalMessage}${warnMessage}`))
          }),
        )
      }),
    )
  }

  /**
   * 判断该异常是否应被计入失败次数
   */
  private shouldCountAsFailure(err: unknown, options: FailLimitOptions): boolean {
    // 如果用户提供了自定义过滤器，优先使用
    if (options.errorFilter) {
      return options.errorFilter(err)
    }

    // 默认行为：匹配 400 / 401 / 403
    const statusCode =
      err instanceof HttpException
        ? err.getStatus()
        : typeof err === 'object' && err !== null && 'status' in err
          ? err.status
          : undefined
    return statusCode === 400 || statusCode === 401 || statusCode === 403
  }

  private getErrorMessage(err: unknown): string {
    if (err instanceof HttpException) {
      const response = err.getResponse()
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const message = response.message
        return Array.isArray(message) ? message.join('; ') : String(message)
      }
      return err.message
    }

    if (err instanceof Error) {
      return err.message
    }

    return String(err)
  }

  /**
   * 构建锁定消息
   */
  private buildLockMessage(options: FailLimitOptions): string {
    return typeof options.lockedMessage === 'function'
      ? options.lockedMessage(options.lockTime, options.maxCount)
      : options.lockedMessage || '该操作因多次失败已被锁定'
  }

  /**
   * 构建警告消息
   */
  private buildWarnMessage(remainCount: number, options: FailLimitOptions): string {
    return typeof options.warningMessage === 'function'
      ? options.warningMessage(remainCount, options.maxCount)
      : options.warningMessage || `，还剩 ${remainCount} 次机会`
  }
}
