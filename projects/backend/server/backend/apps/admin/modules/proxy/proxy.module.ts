import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IpProxyEntity, MerchantEntity } from '@admin/database'
import { BusinessModule } from '../business'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { ProxyProbeService } from './proxy-probe.service'

@Module({
  imports: [BusinessModule, TypeOrmModule.forFeature([IpProxyEntity, MerchantEntity])],
  controllers: [ProxyController],
  providers: [ProxyService, ProxyProbeService],
})
export class ProxyModule {}
