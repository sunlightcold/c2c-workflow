import developmentConfig from '@/config/development'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

dayjs.tz.setDefault(developmentConfig.common.timeZone || 'Asia/Shanghai')
