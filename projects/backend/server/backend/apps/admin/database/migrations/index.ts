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
import { C2cTelegramAdministration1789008000000 } from './c2c-telegram-administration.migration'
import { C2cTelegramUpdateInbox1789009000000 } from './c2c-telegram-update-inbox.migration'
import { C2cTelegramInteractions1789010000000 } from './c2c-telegram-interactions.migration'
import { C2cTelegramBatchInteractions1789011000000 } from './c2c-telegram-batch-interactions.migration'
import { PaymentAccountCredentials1789012000000 } from './payment-account-credentials.migration'
import { C2cAutomaticPayments1789013000000 } from './c2c-automatic-payments.migration'
import { RemoveAiAndClientError1789014000000 } from './remove-ai-client-error.migration'
import { C2cTelegramPaymentBotType1789015000000 } from './c2c-telegram-payment-bot-type.migration'
import { C2cTelegramBotRuntime1789016000000 } from './c2c-telegram-bot-runtime.migration'
import { C2cPaymentBatchPolicies1789017000000 } from './c2c-payment-batch-policies.migration'
import { C2cTelegramIdentities1789018000000 } from './c2c-telegram-identities.migration'
import { C2cTelegramCapabilityCleanup1789019000000 } from './c2c-telegram-capability-cleanup.migration'
import { C2cPaymentReconciliationPolicy1789020000000 } from './c2c-payment-reconciliation-policy.migration'
import { C2cPaymentPlanAutomation1789021000000 } from './c2c-payment-plan-automation.migration'

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
  C2cTelegramAdministration1789008000000,
  C2cTelegramUpdateInbox1789009000000,
  C2cTelegramInteractions1789010000000,
  C2cTelegramBatchInteractions1789011000000,
  PaymentAccountCredentials1789012000000,
  C2cAutomaticPayments1789013000000,
  RemoveAiAndClientError1789014000000,
  C2cTelegramPaymentBotType1789015000000,
  C2cTelegramBotRuntime1789016000000,
  C2cPaymentBatchPolicies1789017000000,
  C2cTelegramIdentities1789018000000,
  C2cTelegramCapabilityCleanup1789019000000,
  C2cPaymentReconciliationPolicy1789020000000,
  C2cPaymentPlanAutomation1789021000000,
]
