export const BUSINESS_DATE_FORMAT = 'YYYY-MM-DD'
export const BUSINESS_DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'
export const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Shanghai'
export const DEFAULT_DATABASE_TIME_ZONE = 'UTC'

export type BusinessNowInput = Date | number | string
export type BusinessTimeBucketUnit = 'day' | 'hour' | 'minute' | 'month'

export interface BusinessTimeConfig {
  dbTimeZone: string
  timeZone: string
}

export interface BusinessTimeOptions extends Partial<BusinessTimeConfig> {
  now?: BusinessNowInput
}

export interface BusinessTimeRange extends BusinessTimeConfig {
  endExclusive?: Date
  start?: Date
}

export interface RequiredBusinessTimeRange extends BusinessTimeConfig {
  endExclusive: Date
  start: Date
}

export interface BusinessDayWindow extends BusinessTimeRange {
  date: string
  endExclusive: Date
  endLocalText: string
  start: Date
  startLocalText: string
}

export interface RecentBusinessDaysWindow extends BusinessTimeConfig {
  dates: string[]
  range: BusinessTimeRange
  rangeEndExclusive: Date
  rangeStart: Date
  today: BusinessDayWindow
  todayEndExclusive: Date
  todayStart: Date
}

export interface BusinessDateRangeInput {
  dateFrom?: string
  dateTo?: string
}

export interface BusinessDateRangeWindow extends BusinessTimeRange {
  dateFrom?: string
  dateTo?: string
}

export interface BusinessDateParts extends BusinessTimeConfig {
  compactDate: string
  compactDateTime: string
  date: string
  dayOfMonth: number
  yearMonth: string
  yearMonthKey: string
}

export interface BusinessTimeBucket extends BusinessTimeConfig {
  expiresInSeconds: number
  key: string
}
