import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  MerchantOrderSyncCheckpointEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { C2cPlatformModule } from '../c2c-platform'
import { PaymentChannelModule } from '../payment/payment-channel.module'
import { CredentialModule } from '../system/credential'
import { C2cOrderSyncService } from './c2c-order-sync.service'
import { C2C_ORDER_SYNC_STORE } from './c2c-order.tokens'
import { TypeOrmC2cOrderSyncStore } from './typeorm-c2c-order-sync.store'
import { C2cOrderController } from './c2c-order.controller'
import { C2cOrderService } from './c2c-order.service'
import { C2cOrderAppealService, C2C_ORDER_APPEAL_STORE } from './c2c-order-appeal.service'
import { TypeOrmC2cOrderAppealStore } from './typeorm-c2c-order-appeal.store'
import { C2cReceiptImageService } from './c2c-receipt-image.service'
import { ReceiptDocumentDownloader } from './receipt-document-downloader'
import { C2cPlatformChatService } from './c2c-platform-chat.service'
import { C2cAutoAppealService } from './c2c-auto-appeal.service'
import { C2cReportService } from './c2c-report.service'
import { C2cCompletionReplyService } from './c2c-completion-reply.service'

@Module({
  imports: [
    BusinessModule,
    C2cPlatformModule,
    CredentialModule,
    PaymentChannelModule,
    TypeOrmModule.forFeature([
      MerchantEntity,
      MerchantOrderEntity,
      MerchantOrderStatusHistoryEntity,
      MerchantOrderSyncCheckpointEntity,
      PaymentOrderEntity,
      PaymentOrderStatusHistoryEntity,
    ]),
  ],
  controllers: [C2cOrderController],
  providers: [
    TypeOrmC2cOrderSyncStore,
    { provide: C2C_ORDER_SYNC_STORE, useExisting: TypeOrmC2cOrderSyncStore },
    C2cOrderSyncService,
    TypeOrmC2cOrderAppealStore,
    { provide: C2C_ORDER_APPEAL_STORE, useExisting: TypeOrmC2cOrderAppealStore },
    C2cOrderAppealService,
    C2cAutoAppealService,
    C2cReportService,
    C2cCompletionReplyService,
    C2cReceiptImageService,
    ReceiptDocumentDownloader,
    C2cOrderService,
    C2cPlatformChatService,
  ],
  exports: [
    C2C_ORDER_SYNC_STORE,
    C2cOrderAppealService,
    C2cAutoAppealService,
    C2cReportService,
    C2cCompletionReplyService,
    C2cOrderSyncService,
    C2cOrderService,
    C2cReceiptImageService,
    ReceiptDocumentDownloader,
    C2cPlatformChatService,
  ],
})
export class C2cOrderModule {}
