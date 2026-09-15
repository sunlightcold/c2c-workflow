import { Injectable } from '@nestjs/common'
import { LogService } from '../../log/log.service'
import { TaskLogService } from '../../log/task-log.service'
import { ScheduleTask } from '../task.decorator'

export const TASK_LOG_RETENTION_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Api接口请求类型任务
 */
@ScheduleTask()
@Injectable()
export class LogClearJob {
  constructor(
    private readonly logService: LogService,
    private readonly taskLogService: TaskLogService,
  ) {}

  /**
   * 清空系统日志
   */
  async clearSystemLog() {
    await this.logService.clear()
  }

  /**
   * 清空任务日志
   */
  async clearTaskLog() {
    const cutoff = new Date(Date.now() - TASK_LOG_RETENTION_MS)
    const deleted = await this.taskLogService.clearBefore(cutoff)
    return { cutoff: cutoff.toISOString(), deleted }
  }
}
