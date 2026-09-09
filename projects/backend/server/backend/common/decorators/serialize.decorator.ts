import { UseInterceptors } from '@nestjs/common'
import type { ClassConstructor } from 'class-transformer'
import { SerializeInterceptor } from '../interceptors/serialize.interceptor'

/**
 * 响应序列化与安全约束装饰器
 * 配合 class-transformer 的 @Expose() 使用，可自动剔除未声明字段并进行运行时校验
 * @param dto 需要被转换和验证的目标 DTO 类
 */
export function Serialize(dto: ClassConstructor<any>) {
  return UseInterceptors(new SerializeInterceptor(dto))
}
