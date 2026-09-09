import { SetMetadata } from '@nestjs/common'

export const SKIP_LOG_KEY = Symbol('SKIP_LOG_KEY')
export const SkipLog = () => SetMetadata(SKIP_LOG_KEY, true)
