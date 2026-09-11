import {
  MerchantEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
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
    ]),
  ],
  controllers: [PaymentOrderController, PaymentBatchController, C2cMerchantPaymentController],
  providers: [
    PaymentPlanResolver,
    { provide: PAYMENT_PLAN_RESOLVER, useExisting: PaymentPlanResolver },
    PaymentOrderService,
    PaymentBatchService,
    PaymentAccountBalanceService,
    C2cMerchantPaymentService,
    C2cPaymentCancellationService,
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
  ],
})
export class PaymentModule {}
