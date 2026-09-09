import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
} from '@nestjs/common'
import { ClassConstructor, plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { Observable } from 'rxjs'
import { switchMap } from 'rxjs/operators'

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor<any>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      switchMap(async (data) => {
        // 如果 Controller 压根没返回数据，直接放行
        if (!data) return data

        // 1. 使用 class-transformer 把原始 JS 对象转换成 DTO 实例
        // excludeExtraneousValues: true 确保所有未被 @Expose 修饰的字段被直接丢弃
        const entityInstance = plainToInstance(this.dto, data, {
          excludeExtraneousValues: true,
        })

        // 2. 使用 class-validator 验证返回值的合法性
        // forbidUnknownValues: false 允许校验那些没有任何 class-validator 装饰器的对象，避免 unknownValue 报错
        const errors = await validate(entityInstance, { forbidUnknownValues: false })
        if (errors.length > 0) {
          // 在后台打印详细的 DTO 约束失败原因，方便开发时定位问题
          console.error('[SerializeInterceptor] Response Validation Error:', errors)
          // 向上抛出 500 表示服务器返回了脏数据或者不符合约定的结构
          throw new InternalServerErrorException('接口响应数据格式异常，已被系统拦截')
        }

        return entityInstance
      }),
    )
  }
}
