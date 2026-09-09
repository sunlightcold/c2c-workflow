import { ErrorEnum } from '@/common/constants'
import { isEmpty } from '@/common/utils'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ModuleRef, Reflector } from '@nestjs/core'
import { UnknownElementException } from '@nestjs/core/errors/exceptions/unknown-element.exception'
import { TASK_DECORATOR_KEY } from './task.decorator'

@Injectable()
export class TaskInvokerService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly reflector: Reflector,
  ) {}

  async callTask(name: string, data: string) {
    const [serviceName, methodName] = name.split('.')
    this.checkServiceMeta(serviceName, methodName)

    const service = this.moduleRef.get(serviceName, { strict: false })

    if (isEmpty(data)) {
      return await service[methodName]()
    }

    // 参数安全转换
    const parseArgs = this.safeParse(data)

    if (Array.isArray(parseArgs)) {
      // 数组形式则自动扩展成方法参数回掉
      return await service[methodName](...parseArgs)
    }

    return await service[methodName](parseArgs)
  }

  checkService(service: string) {
    const [serviceName, methodName] = service.split('.')
    this.checkServiceMeta(serviceName, methodName)
  }

  /**
   * 检查任务注解和安全判断
   */
  checkServiceMeta(serviceName: string, methodName: string) {
    if (!serviceName) throw new BadRequestException('任务Service名称错误')
    if (!methodName) throw new BadRequestException('任务方法名称错误')

    try {
      const service = this.moduleRef.get(serviceName, { strict: false })

      // 所执行的任务不存在
      if (!service || !(methodName in service))
        throw new NotFoundException(ErrorEnum.TASK_NOT_FOUND)

      // 检测是否有 Task 注解
      const hasTaskMeta = this.reflector.get<boolean>(TASK_DECORATOR_KEY, service.constructor)
      if (!hasTaskMeta) {
        throw new BadRequestException(ErrorEnum.INSECURE_TASK)
      }
    } catch (error) {
      if (error instanceof UnknownElementException) {
        // 任务不存在
        throw new NotFoundException(ErrorEnum.TASK_NOT_FOUND)
      }

      // 其余错误则不处理，继续抛出
      throw error
    }
  }

  private safeParse(args: string): unknown | string {
    try {
      return JSON.parse(args)
    } catch {
      return args
    }
  }
}
