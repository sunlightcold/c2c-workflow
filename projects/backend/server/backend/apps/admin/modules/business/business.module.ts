import {
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentPlatformEntity,
  PaymentBatchPolicyEntity,
  TenantEntity,
  MerchantPlatformCredentialEntity,
  TelegramBotEntity,
  TelegramGroupEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessController } from './business.controller'
import { BusinessScopeService } from './business-scope.service'
import { MerchantService } from './merchant.service'
import { PaymentConfigService } from './payment-config.service'
import { TenantService } from './tenant.service'
import { MerchantPlatformCredentialService } from './merchant-platform-credential.service'
import { C2cPlatformModule } from '../c2c-platform'

@Module({
  imports: [
    C2cPlatformModule,
    TypeOrmModule.forFeature([
      TenantEntity,
      MerchantEntity,
      PaymentPlatformEntity,
      PaymentBatchPolicyEntity,
      PaymentChannelEntity,
      PaymentAccountEntity,
      PaymentAccountChannelEntity,
      MerchantPaymentPlanEntity,
      MerchantPlatformCredentialEntity,
      TelegramBotEntity,
      TelegramGroupEntity,
    ]),
  ],
  controllers: [BusinessController],
  providers: [
    BusinessScopeService,
    TenantService,
    MerchantService,
    MerchantPlatformCredentialService,
    PaymentConfigService,
  ],
  exports: [
    BusinessScopeService,
    TenantService,
    MerchantService,
    MerchantPlatformCredentialService,
    PaymentConfigService,
  ],
})
export class BusinessModule {}
