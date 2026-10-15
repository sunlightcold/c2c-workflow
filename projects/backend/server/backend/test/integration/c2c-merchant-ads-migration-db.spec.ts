/// <reference types="jest" />

import {
  C2C_FOUNDATION_IDS,
  C2cBusinessFoundation1789000000000,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { C2cMerchantPlatformCredentials1789003000000 } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { C2cMerchantOrders1789004000000 } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { C2cMerchantAds1789029000000 } from '@/apps/admin/database/migrations/c2c-merchant-ads.migration'
import { SystemFoundation1784000000000 } from '@/apps/admin/database/migrations/system-foundation.migration'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('C2C merchant advertisement migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `merchant_ad_migration_test_${process.pid}_${Date.now()}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const merchantId = '00000000-0000-4000-8000-000000000201'
  const otherMerchantId = '00000000-0000-4000-8000-000000000202'
  const adId = '00000000-0000-4000-8000-000000000203'
  let adminDataSource: DataSource
  let dataSource: DataSource

  beforeAll(async () => {
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      migrations: [
        SystemFoundation1784000000000,
        C2cBusinessFoundation1789000000000,
        C2cMerchantPlatformCredentials1789003000000,
        C2cMerchantOrders1789004000000,
        C2cMerchantAds1789029000000,
      ],
      migrationsTableName: 'schema_migrations',
      migrationsTransactionMode: 'each',
      extra: { options: `-c search_path=${schema},public` },
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('creates the advertisement schema and skips the next deployment', async () => {
    const applied = await dataSource.runMigrations()
    expect(applied.map(({ name }) => name)).toEqual([
      'SystemFoundation1784000000000',
      'C2cBusinessFoundation1789000000000',
      'C2cMerchantPlatformCredentials1789003000000',
      'C2cMerchantOrders1789004000000',
      'C2cMerchantAds1789029000000',
    ])
    await expect(dataSource.runMigrations()).resolves.toEqual([])
    await expect(
      dataSource.query(
        `SELECT name FROM schema_migrations WHERE name = 'C2cMerchantAds1789029000000'`,
      ),
    ).resolves.toEqual([{ name: 'C2cMerchantAds1789029000000' }])
    await expect(
      dataSource.query(
        `SELECT table_name, column_name, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name IN ('merchant_ad', 'merchant_ad_run')
           AND data_type = 'numeric'
         ORDER BY table_name, column_name`,
        [schema],
      ),
    ).resolves.toEqual(
      [
        ['merchant_ad', 'availableAmount'],
        ['merchant_ad', 'maxFiatAmount'],
        ['merchant_ad', 'minFiatAmount'],
        ['merchant_ad', 'price'],
        ['merchant_ad_run', 'actualPrice'],
        ['merchant_ad_run', 'currentPrice'],
        ['merchant_ad_run', 'targetPrice'],
      ].map(([table_name, column_name]) => ({
        table_name,
        column_name,
        numeric_precision: 36,
        numeric_scale: 18,
      })),
    )
    await dataSource.query(
      `INSERT INTO merchant (id, "tenantId", code, name, platform)
       VALUES ($1, $3, 'ad-merchant-1', '广告商家一', 'BINANCE'),
              ($2, $3, 'ad-merchant-2', '广告商家二', 'OKX')`,
      [merchantId, otherMerchantId, tenantId],
    )
  })

  it('stores exact decimal prices, disabled defaults and a persistent pending run', async () => {
    await dataSource.query(
      `INSERT INTO merchant_ad (
         id, "tenantId", "merchantId", platform, "platformAdId", asset, "fiatCurrency",
         price, status, "lastSyncedAt"
       ) VALUES ($1, $2, $3, 'BINANCE', '10001', 'USDT', 'CNY',
         '7.123456789012345678', 'ONLINE', now())`,
      [adId, tenantId, merchantId],
    )
    const [ad] = await dataSource.query(
      `SELECT price, enabled, "ruleVersion", rule, "pendingRunId", "paymentMethods"
       FROM merchant_ad WHERE id = $1`,
      [adId],
    )
    expect(ad).toEqual({
      price: '7.123456789012345678',
      enabled: false,
      ruleVersion: 0,
      rule: null,
      pendingRunId: null,
      paymentMethods: [],
    })
    const [run] = await dataSource.query(
      `INSERT INTO merchant_ad_run (
         "tenantId", "merchantId", "adId", "ruleVersion", rule, trigger, status,
         "currentPrice", "targetPrice", "platformAdId", reason
       ) VALUES ($1, $2, $3, 1, $4::jsonb, 'AUTO', 'PENDING',
         '7.123456789012345678', '7.13', '10001', '等待平台回查') RETURNING id`,
      [tenantId, merchantId, adId, JSON.stringify({ mode: 'FIXED', fixedLimit: '7.14' })],
    )
    await dataSource.query(`UPDATE merchant_ad SET "pendingRunId" = $1 WHERE id = $2`, [
      run.id,
      adId,
    ])
    await expect(
      dataSource.query(
        `SELECT ad."pendingRunId", run.status, run.rule
         FROM merchant_ad AS ad
         JOIN merchant_ad_run AS run ON run.id = ad."pendingRunId"
         WHERE ad.id = $1`,
        [adId],
      ),
    ).resolves.toEqual([
      {
        pendingRunId: run.id,
        status: 'PENDING',
        rule: { mode: 'FIXED', fixedLimit: '7.14' },
      },
    ])
  })

  it('rejects sell or non-USDT advertisements and mismatched merchant platforms', async () => {
    const insert = `INSERT INTO merchant_ad (
      "tenantId", "merchantId", platform, "platformAdId", asset, "fiatCurrency", side,
      price, status, "lastSyncedAt"
    ) VALUES ($1, $2, $3, $4, $5, 'CNY', $6, '7.10', 'ONLINE', now())`
    await expect(
      dataSource.query(insert, [tenantId, merchantId, 'BINANCE', 'sell-1', 'USDT', 'SELL']),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      dataSource.query(insert, [tenantId, merchantId, 'BINANCE', 'btc-1', 'BTC', 'BUY']),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      dataSource.query(insert, [tenantId, merchantId, 'OKX', 'wrong-platform', 'USDT', 'BUY']),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      dataSource.query(insert, [tenantId, merchantId, 'BINANCE', '10001', 'USDT', 'BUY']),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('rejects a run linked to another merchant advertisement', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO merchant_ad_run (
           "tenantId", "merchantId", "adId", "ruleVersion", rule, trigger, status,
           "platformAdId", reason
         ) VALUES ($1, $2, $3, 1, '{}'::jsonb, 'PREVIEW', 'READY', '10001', '试算')`,
        [tenantId, otherMerchantId, adId],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
