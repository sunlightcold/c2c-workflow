import { MerchantEntity, PaymentOrderEntity } from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { C2cOrderModule } from '../c2c-order'
import { C2cPlatformModule } from '../c2c-platform'
import {
  C2cPaymentPreflightVerifier,
  PAYMENT_PREFLIGHT_STORE,
} from './c2c-payment-preflight-verifier'
import { PAYMENT_ORDER_STORE } from './payment-execution-coordinator'
import { PaymentOrderService } from './payment-order.service'
import { PaymentOrderController } from './payment-order.controller'
import { PAYMENT_PLAN_RESOLVER, PaymentPlanResolver } from './payment-plan-resolver'
import { TypeOrmPaymentOrderStore } from './typeorm-payment-order.store'
import { TypeOrmPaymentPreflightStore } from './typeorm-payment-preflight.store'

@Module({
  imports: [
    BusinessModule,
    C2cOrderModule,
    C2cPlatformModule,
    TypeOrmModule.forFeature([MerchantEntity, PaymentOrderEntity]),
  ],
  controllers: [PaymentOrderController],
  providers: [
    PaymentPlanResolver,
    { provide: PAYMENT_PLAN_RESOLVER, useExisting: PaymentPlanResolver },
    PaymentOrderService,
    TypeOrmPaymentOrderStore,
    { provide: PAYMENT_ORDER_STORE, useExisting: TypeOrmPaymentOrderStore },
    TypeOrmPaymentPreflightStore,
    { provide: PAYMENT_PREFLIGHT_STORE, useExisting: TypeOrmPaymentPreflightStore },
    C2cPaymentPreflightVerifier,
  ],
  exports: [
    C2cPaymentPreflightVerifier,
    PaymentOrderService,
    PAYMENT_ORDER_STORE,
    PAYMENT_PLAN_RESOLVER,
  ],
})
export class PaymentModule {}
