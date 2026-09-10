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
  controllers: [PaymentOrderController, PaymentBatchController],
  providers: [
    PaymentPlanResolver,
    { provide: PAYMENT_PLAN_RESOLVER, useExisting: PaymentPlanResolver },
    PaymentOrderService,
    PaymentBatchService,
    TypeOrmPaymentOrderStore,
    { provide: PAYMENT_ORDER_STORE, useExisting: TypeOrmPaymentOrderStore },
    TypeOrmPaymentPreflightStore,
    { provide: PAYMENT_PREFLIGHT_STORE, useExisting: TypeOrmPaymentPreflightStore },
    C2cPaymentPreflightVerifier,
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
  ],
  exports: [
    C2cPaymentPreflightVerifier,
    PAYMENT_EXECUTOR,
    PLATFORM_PAYMENT_CONFIRMER,
    PaymentExecutionCoordinator,
    PaymentOrderService,
    PaymentBatchService,
    PAYMENT_ORDER_STORE,
    PAYMENT_PLAN_RESOLVER,
  ],
})
export class PaymentModule {}
