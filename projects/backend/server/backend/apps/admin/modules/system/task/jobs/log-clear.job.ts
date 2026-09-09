import { LogService, TaskLogService } from 'apps/admin/modules/system'
import { Injectable } from '@nestjs/common'
import { ScheduleTask } from '../task.decorator'

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
    await this.taskLogService.clear()
  }
}
