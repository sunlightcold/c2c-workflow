import { Injectable } from '@nestjs/common'
import { ScheduleTask } from '../task.decorator'

/**
 * Api接口请求类型任务
 */
@ScheduleTask()
@Injectable()
export class HttpRequestJob {
  /**
   * 发起请求
   */
  handle(data: unknown) {
    console.info('start HttpRequestJob', HttpRequestJob.name, data)
  }
}
