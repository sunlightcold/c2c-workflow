import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { resolveBusinessTimeConfig } from './business-time.config'
import {
  BUSINESS_DATE_FORMAT,
  BUSINESS_DATE_TIME_FORMAT,
  type BusinessDateParts,
  type BusinessDateRangeInput,
  type BusinessDateRangeWindow,
  type BusinessDayWindow,
  type BusinessTimeBucket,
  type BusinessTimeBucketUnit,
  type BusinessTimeConfig,
  type BusinessTimeOptions,
  type RecentBusinessDaysWindow,
} from './business-time.types'

dayjs.extend(utc)
dayjs.extend(timezone)

export function createBusinessDayWindow(
  date: string,
  options: Partial<BusinessTimeConfig> = {},
): BusinessDayWindow {
  const config = resolveBusinessTimeConfig(options)
  const start = dayjs.tz(date, config.timeZone).startOf('day')
  return createBusinessDayWindowFromStart(start, config)
}

export function createRelativeBusinessDayWindow(
  dayOffset: number,
  options: BusinessTimeOptions = {},
): BusinessDayWindow {
  const config = resolveBusinessTimeConfig(options)
  const start = toBusinessNow(options.now, config.timeZone).startOf('day').add(dayOffset, 'day')
  return createBusinessDayWindowFromStart(start, config)
}

export function createRecentBusinessDaysWindow(
  dayCount: number,
  options: BusinessTimeOptions = {},
): RecentBusinessDaysWindow {
  if (!Number.isInteger(dayCount) || dayCount <= 0) {
    throw new Error('dayCount must be a positive integer')
  }

  const config = resolveBusinessTimeConfig(options)
  const todayStart = toBusinessNow(options.now, config.timeZone).startOf('day')
  const today = createBusinessDayWindowFromStart(todayStart, config)
  const rangeStart = todayStart.subtract(dayCount - 1, 'day')
  const dates = Array.from({ length: dayCount }, (_, index) =>
    rangeStart.add(index, 'day').format(BUSINESS_DATE_FORMAT),
  )

  return {
    ...config,
    dates,
    range: {
      ...config,
      endExclusive: today.endExclusive,
      start: rangeStart.toDate(),
    },
    rangeEndExclusive: today.endExclusive,
    rangeStart: rangeStart.toDate(),
    today,
    todayEndExclusive: today.endExclusive,
    todayStart: today.start,
  }
}

export function createBusinessDateRangeWindow(
  input: BusinessDateRangeInput,
  options: Partial<BusinessTimeConfig> = {},
): BusinessDateRangeWindow | undefined {
  const { dateFrom, dateTo } = input
  if (!dateFrom && !dateTo) return undefined

  const config = resolveBusinessTimeConfig(options)
  return {
    ...config,
    dateFrom,
    dateTo,
    endExclusive: dateTo
      ? dayjs.tz(dateTo, config.timeZone).startOf('day').add(1, 'day').toDate()
      : undefined,
    start: dateFrom ? dayjs.tz(dateFrom, config.timeZone).startOf('day').toDate() : undefined,
  }
}

export function getCurrentBusinessDateParts(options: BusinessTimeOptions = {}): BusinessDateParts {
  const config = resolveBusinessTimeConfig(options)
  const current = toBusinessNow(options.now, config.timeZone)
  return {
    ...config,
    compactDate: current.format('YYYYMMDD'),
    compactDateTime: current.format('YYYYMMDDHHmmss'),
    date: current.format(BUSINESS_DATE_FORMAT),
    dayOfMonth: current.date(),
    yearMonth: current.format('YYYY-MM'),
    yearMonthKey: current.format('YYYY:MM'),
  }
}

export function getDaysInBusinessMonth(
  yearMonth: string,
  options: Partial<BusinessTimeConfig> = {},
) {
  const config = resolveBusinessTimeConfig(options)
  return dayjs.tz(`${yearMonth.replace(':', '-')}-01`, config.timeZone).daysInMonth()
}

export function createBusinessTimeBucket(
  unit: BusinessTimeBucketUnit,
  options: BusinessTimeOptions = {},
): BusinessTimeBucket {
  const config = resolveBusinessTimeConfig(options)
  const current = toBusinessNow(options.now, config.timeZone)
  const bucketStart = current.startOf(unit)
  const bucketEnd = bucketStart.add(1, unit)
  return {
    ...config,
    expiresInSeconds: Math.max(0, bucketEnd.diff(current, 'second')),
    key: bucketStart.format(getBucketFormat(unit)),
  }
}

function createBusinessDayWindowFromStart(
  start: Dayjs,
  config: BusinessTimeConfig,
): BusinessDayWindow {
  const endExclusive = start.add(1, 'day')
  return {
    ...config,
    date: start.format(BUSINESS_DATE_FORMAT),
    endExclusive: endExclusive.toDate(),
    endLocalText: endExclusive.subtract(1, 'second').format(BUSINESS_DATE_TIME_FORMAT),
    start: start.toDate(),
    startLocalText: start.format(BUSINESS_DATE_TIME_FORMAT),
  }
}

function toBusinessNow(now: BusinessTimeOptions['now'], timeZone: string) {
  if (!now) return dayjs().tz(timeZone)
  return dayjs(now).tz(timeZone)
}

function getBucketFormat(unit: BusinessTimeBucketUnit) {
  const formats: Record<BusinessTimeBucketUnit, string> = {
    day: 'YYYY-MM-DD',
    hour: 'YYYY-MM-DD-HH',
    minute: 'YYYY-MM-DD-HH-mm',
    month: 'YYYY-MM',
  }
  return formats[unit]
}
