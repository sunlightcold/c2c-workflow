import { MerchantEntity, PaymentOrderEntity } from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { PAYMENT_ORDER_STORE } from './payment-execution-coordinator'
import { PaymentOrderService } from './payment-order.service'
import { PaymentOrderController } from './payment-order.controller'
import { PAYMENT_PLAN_RESOLVER, PaymentPlanResolver } from './payment-plan-resolver'
import { TypeOrmPaymentOrderStore } from './typeorm-payment-order.store'

@Module({
  imports: [BusinessModule, TypeOrmModule.forFeature([MerchantEntity, PaymentOrderEntity])],
  controllers: [PaymentOrderController],
  providers: [
    PaymentPlanResolver,
    { provide: PAYMENT_PLAN_RESOLVER, useExisting: PaymentPlanResolver },
    PaymentOrderService,
    TypeOrmPaymentOrderStore,
    { provide: PAYMENT_ORDER_STORE, useExisting: TypeOrmPaymentOrderStore },
  ],
  exports: [PaymentOrderService, PAYMENT_ORDER_STORE, PAYMENT_PLAN_RESOLVER],
})
export class PaymentModule {}
