/// <reference types="jest" />

jest.mock('@/common/utils/config', () => ({
  getConfig: jest.fn(() => ({
    dbTimeZone: 'UTC',
    timeZone: 'Asia/Shanghai',
  })),
}))

import {
  createBusinessTimeBucket,
  createBusinessDateRangeWindow,
  createBusinessDayWindow,
  createRecentBusinessDaysWindow,
  getCurrentBusinessDateParts,
  getDaysInBusinessMonth,
} from './business-time'
import { createBusinessTimeRangeCondition, toBusinessDateSql } from './business-time.sql'
import { createBusinessTimeRangeOperator } from './business-time.typeorm'

describe('business time', () => {
  it('creates a Shanghai business day window over UTC stored timestamps', () => {
    const window = createBusinessDayWindow('2026-05-24')

    expect(window).toMatchObject({
      date: '2026-05-24',
      dbTimeZone: 'UTC',
      endLocalText: '2026-05-24 23:59:59',
      startLocalText: '2026-05-24 00:00:00',
      timeZone: 'Asia/Shanghai',
    })
    expect(window.start).toEqual(new Date('2026-05-23T16:00:00.000Z'))
    expect(window.endExclusive).toEqual(new Date('2026-05-24T16:00:00.000Z'))
  })

  it('creates recent business days from the configured business timezone', () => {
    const window = createRecentBusinessDaysWindow(7, {
      now: '2026-05-23T18:30:00.000Z',
    })

    expect(window.dates).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
    ])
    expect(window.rangeStart).toEqual(new Date('2026-05-17T16:00:00.000Z'))
    expect(window.rangeEndExclusive).toEqual(new Date('2026-05-24T16:00:00.000Z'))
  })

  it('creates half-open TypeORM operators for optional date range filters', () => {
    const window = createBusinessDateRangeWindow({
      dateFrom: '2026-04-22',
      dateTo: '2026-04-23',
    })

    expect(window).toMatchObject({
      start: new Date('2026-04-21T16:00:00.000Z'),
      endExclusive: new Date('2026-04-23T16:00:00.000Z'),
    })

    const operator = createBusinessTimeRangeOperator(window!)
    expect(operator).toMatchObject({
      _objectLiteralParameters: {
        end: new Date('2026-04-23T16:00:00.000Z'),
        start: new Date('2026-04-21T16:00:00.000Z'),
      },
      _type: 'raw',
    })
  })

  it('creates reusable SQL for local date grouping and range filters', () => {
    expect(toBusinessDateSql('"order"."createdAt"')).toBe(
      `TO_CHAR(("order"."createdAt" AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`,
    )

    const condition = createBusinessTimeRangeCondition('"order"."createdAt"', {
      dbTimeZone: 'UTC',
      endExclusive: new Date('2026-05-24T16:00:00.000Z'),
      start: new Date('2026-05-23T16:00:00.000Z'),
      timeZone: 'Asia/Shanghai',
    })

    expect(condition).toEqual({
      expression: `"order"."createdAt" >= :start AND "order"."createdAt" < :end`,
      parameters: {
        end: new Date('2026-05-24T16:00:00.000Z'),
        start: new Date('2026-05-23T16:00:00.000Z'),
      },
    })
  })

  it('uses explicit timezone options without requiring global config', () => {
    const window = createBusinessDayWindow('2026-04-22', {
      timeZone: 'America/Los_Angeles',
    })

    expect(window).toMatchObject({
      dbTimeZone: 'UTC',
      timeZone: 'America/Los_Angeles',
    })
    expect(window.start).toEqual(new Date('2026-04-22T07:00:00.000Z'))
    expect(window.endExclusive).toEqual(new Date('2026-04-23T07:00:00.000Z'))
  })

  it('returns reusable business date parts for ids and date-keyed features', () => {
    const parts = getCurrentBusinessDateParts({
      now: '2026-05-23T18:30:00.000Z',
    })

    expect(parts).toMatchObject({
      compactDate: '20260524',
      compactDateTime: '20260524023000',
      date: '2026-05-24',
      dayOfMonth: 24,
      yearMonth: '2026-05',
      yearMonthKey: '2026:05',
    })
  })

  it('creates business time buckets with expiration seconds', () => {
    const bucket = createBusinessTimeBucket('day', {
      now: '2026-05-23T18:30:00.000Z',
    })

    expect(bucket).toMatchObject({
      expiresInSeconds: 77400,
      key: '2026-05-24',
    })
  })

  it('calculates days in a configured business month', () => {
    expect(getDaysInBusinessMonth('2026:02')).toBe(28)
  })
})
