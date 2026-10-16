import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IpProxyEntity, MerchantEntity } from '@admin/database'
import { ProxyNetworkService } from './proxy-network.service'
import { ProxyExpiryService } from './proxy-expiry.service'

@Module({
  imports: [TypeOrmModule.forFeature([IpProxyEntity, MerchantEntity])],
  providers: [ProxyNetworkService, ProxyExpiryService],
  exports: [ProxyNetworkService],
})
export class ProxyNetworkModule {}
