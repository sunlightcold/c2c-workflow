import {
  PaymentAccountEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentOrderEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CredentialModule } from '../system/credential'
import {
  ALIPAY_ACCOUNT_GATEWAY_FACTORY,
  AlipayAccountGatewayProvider,
} from './alipay-account-gateway.provider'
import { AlipayGatewayFactory } from './alipay-gateway.factory'
import {
  AlipayPaymentChannelCapabilityFactory,
  PAYMENT_CHANNEL_CAPABILITY_FACTORY,
} from './payment-channel-capability.factory'
import { PaymentReceiptService } from './payment-receipt.service'

@Module({
  imports: [
    CredentialModule,
    TypeOrmModule.forFeature([
      PaymentAccountEntity,
      PaymentBatchEntity,
      PaymentBatchItemEntity,
      PaymentOrderEntity,
    ]),
  ],
  providers: [
    AlipayGatewayFactory,
    AlipayAccountGatewayProvider,
    {
      provide: ALIPAY_ACCOUNT_GATEWAY_FACTORY,
      useExisting: AlipayAccountGatewayProvider,
    },
    AlipayPaymentChannelCapabilityFactory,
    {
      provide: PAYMENT_CHANNEL_CAPABILITY_FACTORY,
      useExisting: AlipayPaymentChannelCapabilityFactory,
    },
    PaymentReceiptService,
  ],
  exports: [
    ALIPAY_ACCOUNT_GATEWAY_FACTORY,
    PAYMENT_CHANNEL_CAPABILITY_FACTORY,
    PaymentReceiptService,
  ],
})
export class PaymentChannelModule {}
