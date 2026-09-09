import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { EventNames, GlobalEventMap } from './event-map'

@Injectable()
export class EventEmitterService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * 按强类型安全机制发射系统全局事件
   * @param event 事件名，必须包含在 EVENT_KEYS 内
   * @param payload 荷载，必须与 GlobalEventMap 中的定义完全一致
   * @returns boolean
   */
  public emit<T extends EventNames>(event: T, payload: GlobalEventMap[T]): boolean {
    return this.eventEmitter.emit(event, payload)
  }

  /**
   * 同步等待系统全局事件处理完毕
   * 如果监听器中存在耗时的数据库操作，此方法会阻塞直到全部监听器执行结束
   * @param event 事件名
   * @param payload 荷载
   * @returns 监听器返回的结果数组
   */
  public emitAsync<T extends EventNames>(event: T, payload: GlobalEventMap[T]): Promise<unknown[]> {
    return this.eventEmitter.emitAsync(event, payload)
  }
}
