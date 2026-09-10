import type { MigrationInterface } from 'typeorm'
import { SystemFoundation1784000000000 } from './system-foundation.migration'
import { TutorialCenter1785000000000 } from './tutorial-center.migration'
import { TutorialContentStoragePurpose1785005000000 } from './tutorial-content-storage-purpose.migration'
import { AiGateway1785005500000 } from './ai-gateway.migration'
import { AiGatewayChannelCapacity1785005600000 } from './ai-gateway-channel-capacity.migration'
import { ObjectStorageCenter1785001000000 } from './object-storage-center.migration'
import { ObjectStoragePurposePrefix1785002000000 } from './object-storage-purpose-prefix.migration'
import { ClientErrorEvents1785008000000 } from './client-error-events.migration'
import { AiCallLogs1787001000000 } from './ai-call-logs.migration'
import { C2cBusinessFoundation1789000000000 } from './c2c-business-foundation.migration'
import { C2cPaymentOrders1789001000000 } from './c2c-payment-orders.migration'
import { C2cPaymentRouting1789002000000 } from './c2c-payment-routing.migration'
import { C2cMerchantPlatformCredentials1789003000000 } from './c2c-merchant-platform-credentials.migration'
import { C2cMerchantOrders1789004000000 } from './c2c-merchant-orders.migration'
import { C2cPaymentBatches1789005000000 } from './c2c-payment-batches.migration'
import { C2cMerchantAccountOperations1789006000000 } from './c2c-merchant-account-operations.migration'
import { C2cMerchantOrderAppeals1789007000000 } from './c2c-merchant-order-appeals.migration'

export type AdminMigrationConstructor = new () => MigrationInterface

export const adminMigrations: AdminMigrationConstructor[] = [
  SystemFoundation1784000000000,
  TutorialCenter1785000000000,
  ObjectStorageCenter1785001000000,
  ObjectStoragePurposePrefix1785002000000,
  TutorialContentStoragePurpose1785005000000,
  AiGateway1785005500000,
  AiGatewayChannelCapacity1785005600000,
  ClientErrorEvents1785008000000,
  AiCallLogs1787001000000,
  C2cBusinessFoundation1789000000000,
  C2cPaymentOrders1789001000000,
  C2cPaymentRouting1789002000000,
  C2cMerchantPlatformCredentials1789003000000,
  C2cMerchantOrders1789004000000,
  C2cPaymentBatches1789005000000,
  C2cMerchantAccountOperations1789006000000,
  C2cMerchantOrderAppeals1789007000000,
]
