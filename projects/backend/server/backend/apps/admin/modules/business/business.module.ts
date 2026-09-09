import {
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentPlatformEntity,
  TenantEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessController } from './business.controller'
import { BusinessScopeService } from './business-scope.service'
import { MerchantService } from './merchant.service'
import { PaymentConfigService } from './payment-config.service'
import { TenantService } from './tenant.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      MerchantEntity,
      PaymentPlatformEntity,
      PaymentChannelEntity,
      PaymentAccountEntity,
      PaymentAccountChannelEntity,
      MerchantPaymentPlanEntity,
    ]),
  ],
  controllers: [BusinessController],
  providers: [BusinessScopeService, TenantService, MerchantService, PaymentConfigService],
  exports: [BusinessScopeService, TenantService, MerchantService, PaymentConfigService],
})
export class BusinessModule {}
