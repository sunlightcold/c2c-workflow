import { SetMetadata } from '@nestjs/common'

export const TASK_DECORATOR_KEY = 'TASK_DECORATOR_KEY'

/**
 * 任务标记，没有该任务标记的任务不会被执行，保证全局获取下的模块被安全执行
 */
export const ScheduleTask = () => SetMetadata(TASK_DECORATOR_KEY, true)
