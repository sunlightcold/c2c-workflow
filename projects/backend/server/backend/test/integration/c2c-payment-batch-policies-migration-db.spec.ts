/// <reference types="jest" />

import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cPaymentBatchPolicies } from '@/apps/admin/database/migrations/c2c-payment-batch-policies.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C payment batch policies migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_batch_policy_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

  beforeAll(async () => {
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
    queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    await queryRunner.query(`SET LOCAL search_path TO "${schema}", public`)
  })

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction()
    if (queryRunner && !queryRunner.isReleased) await queryRunner.release()
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('creates policy rules and payment references idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateC2cPaymentRouting(queryRunner.manager)
    await migrateC2cMerchantPlatformCredentials(queryRunner.manager)
    await migrateC2cPaymentBatches(queryRunner.manager)
    await migrateC2cPaymentBatchPolicies(queryRunner.manager)
    await migrateC2cPaymentBatchPolicies(queryRunner.manager)

    const tables = (await queryRunner.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1)
       ORDER BY table_name`,
      [['payment_batch_policy', 'payment_batch_policy_rule']],
    )) as Array<{ table_name: string }>
    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'payment_batch_policy',
      'payment_batch_policy_rule',
    ])

    const columns = (await queryRunner.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = ANY($1)
         AND column_name = ANY($2)
       ORDER BY table_name, column_name`,
      [
        ['merchant_payment_plan', 'payment_order', 'payment_batch'],
        ['batchPolicyId', 'triggerRuleIds', 'triggerSource'],
      ],
    )) as Array<{ table_name: string; column_name: string }>
    expect(columns).toEqual([
      { column_name: 'batchPolicyId', table_name: 'merchant_payment_plan' },
      { column_name: 'batchPolicyId', table_name: 'payment_batch' },
      { column_name: 'triggerRuleIds', table_name: 'payment_batch' },
      { column_name: 'triggerSource', table_name: 'payment_batch' },
      { column_name: 'batchPolicyId', table_name: 'payment_order' },
    ])

    const [policyScope] = (await queryRunner.query(
      `SELECT
         MAX(CASE WHEN column_name = 'scopeType' THEN data_type END) AS "scopeTypeDataType",
         MAX(CASE WHEN column_name = 'merchantId' THEN is_nullable END) AS "merchantIdNullable"
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'payment_batch_policy'
         AND column_name = ANY($1)`,
      [['scopeType', 'merchantId']],
    )) as Array<{ merchantIdNullable: string; scopeTypeDataType: string }>
    expect(policyScope).toEqual({
      merchantIdNullable: 'YES',
      scopeTypeDataType: 'USER-DEFINED',
    })

    const [ruleMerchantColumn] = (await queryRunner.query(
      `SELECT COUNT(*)::text AS count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'payment_batch_policy_rule'
         AND column_name = 'merchantId'`,
    )) as Array<{ count: string }>
    expect(ruleMerchantColumn.count).toBe('0')

    const foreignKeys = (await queryRunner.query(
      `SELECT tc.table_name, string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) columns
       FROM information_schema.table_constraints tc
       INNER JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_schema = tc.constraint_schema
        AND kcu.constraint_name = tc.constraint_name
       WHERE tc.constraint_schema = current_schema()
         AND tc.constraint_type = 'FOREIGN KEY'
         AND tc.constraint_name = ANY($1)
       GROUP BY tc.table_name
       ORDER BY tc.table_name`,
      [
        [
          'fk_merchant_payment_plan_batch_policy',
          'fk_payment_order_batch_policy',
          'fk_payment_batch_policy',
        ],
      ],
    )) as Array<{ columns: string; table_name: string }>
    expect(foreignKeys).toEqual([
      { columns: 'batchPolicyId,tenantId', table_name: 'merchant_payment_plan' },
      { columns: 'batchPolicyId,tenantId', table_name: 'payment_batch' },
      { columns: 'batchPolicyId,tenantId', table_name: 'payment_order' },
    ])

    const tenantId = '00000000-0000-4000-8000-000000000001'
    const otherTenantId = '00000000-0000-4000-8000-000000000002'
    const merchantId = '00000000-0000-4000-8000-000000000011'
    await queryRunner.query(
      `INSERT INTO tenant (id, type, code, name)
       VALUES ($1, 'AGENT', 'AGENT_1', '代理商')`,
      [otherTenantId],
    )
    await queryRunner.query(
      `INSERT INTO merchant (id, "tenantId", code, name, platform)
       VALUES ($1, $2, 'MERCHANT_1', '商家一', 'BINANCE')`,
      [merchantId, tenantId],
    )
    await queryRunner.query('SAVEPOINT invalid_global_policy')
    await expect(
      queryRunner.query(
        `INSERT INTO payment_batch_policy
           ("tenantId", "scopeType", "merchantId", code, name)
         VALUES ($1, 'GLOBAL', $2, 'INVALID_GLOBAL', '错误全局策略')`,
        [tenantId, merchantId],
      ),
    ).rejects.toThrow()
    await queryRunner.query('ROLLBACK TO SAVEPOINT invalid_global_policy')
    await queryRunner.query('SAVEPOINT cross_tenant_policy')
    await expect(
      queryRunner.query(
        `INSERT INTO payment_batch_policy
           ("tenantId", "scopeType", "merchantId", code, name)
         VALUES ($1, 'MERCHANT', $2, 'INVALID_TENANT', '跨经营单位策略')`,
        [otherTenantId, merchantId],
      ),
    ).rejects.toThrow()
    await queryRunner.query('ROLLBACK TO SAVEPOINT cross_tenant_policy')
  })
})
