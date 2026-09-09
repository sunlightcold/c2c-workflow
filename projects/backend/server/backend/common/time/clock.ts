export type TimeUnit = 'day' | 'hour' | 'minute' | 'second'

const unitToMilliseconds: Record<TimeUnit, number> = {
  day: 24 * 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
  second: 1000,
}

export function addTime(date: Date, amount: number, unit: TimeUnit) {
  return new Date(date.getTime() + amount * unitToMilliseconds[unit])
}

export function addCalendarMonths(date: Date, months: number): Date {
  if (!Number.isInteger(months)) {
    throw new Error('months must be an integer')
  }

  const dayOfMonth = date.getUTCDate()
  const result = new Date(date)
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)

  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate()
  result.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth))
  return result
}

export function isBeforeNow(date: Date, now = new Date()) {
  return date.getTime() < now.getTime()
}
