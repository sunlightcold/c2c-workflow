import { getConfig } from '@/common/utils'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

const { timeZone = 'Asia/Shanghai' } = getConfig('common')
dayjs.tz.setDefault(timeZone)
