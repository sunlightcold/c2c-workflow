import {
  MerchantEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchPolicyEntity,
  PaymentBatchPolicyRuleEntity,
  PaymentOrderEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { C2cOrderModule } from '../c2c-order'
import { C2cPlatformModule } from '../c2c-platform'
import {
  C2cPaymentPreflightVerifier,
  PAYMENT_PREFLIGHT_STORE,
} from './c2c-payment-preflight-verifier'
import {
  PAYMENT_EXECUTOR,
  PAYMENT_ORDER_STORE,
  PLATFORM_PAYMENT_CONFIRMER,
  PaymentExecutionCoordinator,
} from './payment-execution-coordinator'
import {
  ALIPAY_ACCOUNT_GATEWAY_FACTORY,
  AlipayAccountGatewayProvider,
} from './alipay-account-gateway.provider'
import { AlipayGatewayFactory } from './alipay-gateway.factory'
import { C2cAlipayPaymentExecutor } from './c2c-alipay-payment.executor'
import { C2cPlatformPaymentConfirmer } from './c2c-platform-payment.confirmer'
import { PaymentOrderService } from './payment-order.service'
import { PaymentOrderController } from './payment-order.controller'
import { PAYMENT_PLAN_RESOLVER, PaymentPlanResolver } from './payment-plan-resolver'
import { TypeOrmPaymentOrderStore } from './typeorm-payment-order.store'
import { TypeOrmPaymentPreflightStore } from './typeorm-payment-preflight.store'
import { PaymentBatchController } from './payment-batch.controller'
import { PaymentBatchService } from './payment-batch.service'
import { PaymentBatchPolicyController } from './payment-batch-policy.controller'
import { PaymentBatchPolicyService } from './payment-batch-policy.service'
import {
  PAYMENT_BATCH_EXECUTOR,
  PAYMENT_BATCH_PREFLIGHT,
  PAYMENT_BATCH_STORE,
  PaymentBatchExecutionCoordinator,
} from './payment-batch-execution-coordinator'
import { AlipayBatchPaymentExecutor } from './alipay-batch-payment.executor'
import { TypeOrmPaymentBatchStore } from './typeorm-payment-batch.store'
import { C2cMerchantPaymentController } from './c2c-merchant-payment.controller'
import { C2cMerchantPaymentService } from './c2c-merchant-payment.service'
import { C2cPaymentCancellationService } from './c2c-payment-cancellation.service'
import { PaymentAccountBalanceService } from './payment-account-balance.service'
import {
  C2C_AUTOMATIC_PAYMENT_STORE,
  C2cAutomaticPaymentService,
} from './c2c-automatic-payment.service'
import { TypeOrmC2cAutomaticPaymentStore } from './typeorm-c2c-automatic-payment.store'

@Module({
  imports: [
    BusinessModule,
    C2cOrderModule,
    C2cPlatformModule,
    TypeOrmModule.forFeature([
      MerchantEntity,
      PaymentOrderEntity,
      PaymentBatchEntity,
      PaymentBatchItemEntity,
      PaymentBatchPolicyEntity,
      PaymentBatchPolicyRuleEntity,
    ]),
  ],
  controllers: [
    PaymentOrderController,
    PaymentBatchController,
    PaymentBatchPolicyController,
    C2cMerchantPaymentController,
  ],
  providers: [
    PaymentPlanResolver,
    { provide: PAYMENT_PLAN_RESOLVER, useExisting: PaymentPlanResolver },
    PaymentOrderService,
    PaymentBatchService,
    PaymentBatchPolicyService,
    PaymentAccountBalanceService,
    C2cMerchantPaymentService,
    C2cPaymentCancellationService,
    C2cAutomaticPaymentService,
    TypeOrmC2cAutomaticPaymentStore,
    { provide: C2C_AUTOMATIC_PAYMENT_STORE, useExisting: TypeOrmC2cAutomaticPaymentStore },
    TypeOrmPaymentBatchStore,
    { provide: PAYMENT_BATCH_STORE, useExisting: TypeOrmPaymentBatchStore },
    TypeOrmPaymentOrderStore,
    { provide: PAYMENT_ORDER_STORE, useExisting: TypeOrmPaymentOrderStore },
    TypeOrmPaymentPreflightStore,
    { provide: PAYMENT_PREFLIGHT_STORE, useExisting: TypeOrmPaymentPreflightStore },
    C2cPaymentPreflightVerifier,
    { provide: PAYMENT_BATCH_PREFLIGHT, useExisting: C2cPaymentPreflightVerifier },
    AlipayGatewayFactory,
    AlipayAccountGatewayProvider,
    {
      provide: ALIPAY_ACCOUNT_GATEWAY_FACTORY,
      useExisting: AlipayAccountGatewayProvider,
    },
    C2cAlipayPaymentExecutor,
    { provide: PAYMENT_EXECUTOR, useExisting: C2cAlipayPaymentExecutor },
    C2cPlatformPaymentConfirmer,
    { provide: PLATFORM_PAYMENT_CONFIRMER, useExisting: C2cPlatformPaymentConfirmer },
    PaymentExecutionCoordinator,
    AlipayBatchPaymentExecutor,
    { provide: PAYMENT_BATCH_EXECUTOR, useExisting: AlipayBatchPaymentExecutor },
    PaymentBatchExecutionCoordinator,
  ],
  exports: [
    C2cPaymentPreflightVerifier,
    PAYMENT_EXECUTOR,
    PLATFORM_PAYMENT_CONFIRMER,
    PaymentExecutionCoordinator,
    PaymentOrderService,
    PaymentBatchService,
    PaymentAccountBalanceService,
    PaymentBatchExecutionCoordinator,
    PAYMENT_ORDER_STORE,
    PAYMENT_PLAN_RESOLVER,
    C2cAutomaticPaymentService,
  ],
})
export class PaymentModule {}
