import { IRequest } from '@/common/interfaces'
import { ResponseModel } from '@/common/models'
import { getFullUrlByRequest } from '@/common/utils'
import { SysLogEntity } from '@admin/database'
import { LogService } from '@admin/modules/system'
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { tap } from 'rxjs/operators'
import { SKIP_LOG_KEY } from './skip-log.decorator'

// Swagger 元数据常量
const SWAGGER_API_OPERATION = 'swagger/apiOperation'
const SWAGGER_API_USE_TAGS = 'swagger/apiUseTags'

// 操作日志拦截器
@Injectable()
export class LogInterceptor<T> implements NestInterceptor<T, ResponseModel<T>> {
  constructor(
    @Inject(LogService) private readonly logService: LogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const skipLog = this.reflector.getAllAndOverride<boolean>(SKIP_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (skipLog) {
      return next.handle()
    }

    // 获取请求对象
    const request = context.switchToHttp().getRequest<IRequest>()
    const handler = context.getHandler()
    const controller = context.getClass()

    const clientInfo = request.clientInfo

    const controllerName = controller.name
    const handlerName = handler.name

    // 获取装饰器内容
    const apiOperation = Reflect.getMetadata(SWAGGER_API_OPERATION, handler)
    const apiOperationSummary = apiOperation.summary ?? ''
    const apiTags = Reflect.getMetadata(SWAGGER_API_USE_TAGS, controller) ?? []
    const apiTag = apiTags[0] ?? 'unknown'

    return next.handle().pipe(
      tap(() => {
        if (request.method === 'GET') return
        const log = new SysLogEntity()
        log.agent = clientInfo.agent
        log.ip = clientInfo.ip
        log.city = clientInfo.ipInfo?.city
        log.region = clientInfo.ipInfo?.region
        log.country = clientInfo.ipInfo?.country
        log.os = clientInfo.os
        log.browser = clientInfo.browser
        log.httpMethod = request.method
        log.url = getFullUrlByRequest(request)
        log.title = apiTag
        log.content = apiOperationSummary
        log.serviceMethod = `${controllerName}.${handlerName}`
        log.username = request.user?.username
        log.body = JSON.stringify(request.body)
        log.query = JSON.stringify(request.query)
        log.params = JSON.stringify(request.params)
        this.logService.create(log)
      }),
    )
  }
}
