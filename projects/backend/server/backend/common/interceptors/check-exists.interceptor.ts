import {
  applyDecorators,
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common'
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type'
import { isEmpty } from 'class-validator'
import { Observable } from 'rxjs'
import { BaseEntity, FindOptionsWhere, Repository } from 'typeorm'
import { IRequest } from '../interfaces'

export interface CheckExistsOptions {
  entity: EntityClassOrSchema
  field: string
  message?: string
  source?: 'body' | 'params' | 'query'
  allowEmpty?: boolean
}

@Injectable()
export class CheckExistsInterceptor implements NestInterceptor {
  constructor(private readonly options: CheckExistsOptions) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<IRequest>()

    // 获取要检查的值
    const source = this.options.source || 'body'
    const value = request[source]?.[this.options.field]

    // 允许空值且值为空，则直接通过
    if (this.options.allowEmpty && isEmpty(value)) {
      return next.handle()
    }

    // 如果值不存在，抛出错误
    if (value === undefined || value === null) {
      throw new BadRequestException(this.options.message || `${this.options.field} is required`)
    }

    // 构建查询条件
    const where: FindOptionsWhere<BaseEntity> = { [this.options.field]: value }

    // 查询是否已存在
    const repository = this.options.entity
    const exists = await (repository as unknown as Repository<BaseEntity>).exists({ where })

    if (exists) {
      throw new BadRequestException(
        this.options.message || `${this.options.field}=${value} already exists`,
      )
    }

    return next.handle()
  }
}

export function CheckExists(
  entity: EntityClassOrSchema,
  field: string,
  options?: Omit<CheckExistsOptions, 'entity' | 'field'>,
) {
  const interceptorOptions: CheckExistsOptions = {
    entity,
    field,
    ...options,
  }

  return applyDecorators(UseInterceptors(new CheckExistsInterceptor(interceptorOptions)))
}
