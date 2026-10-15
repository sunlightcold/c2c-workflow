import {
  MerchantAdEntity,
  MerchantAdRunEntity,
  MerchantEntity,
  TenantEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { C2cPlatformModule } from '../c2c-platform'
import { CredentialModule } from '../system/credential'
import { C2cAdController } from './ad.controller'
import { C2cAdService } from './ad.service'
import { AdLockService } from './ad-lock.service'
import { AdPricingRunner } from './ad-pricing-runner.service'

@Module({
  imports: [
    BusinessModule,
    C2cPlatformModule,
    CredentialModule,
    TypeOrmModule.forFeature([MerchantAdEntity, MerchantAdRunEntity, MerchantEntity, TenantEntity]),
  ],
  controllers: [C2cAdController],
  providers: [C2cAdService, AdLockService, AdPricingRunner],
  exports: [AdPricingRunner],
})
export class C2cAdModule {}
