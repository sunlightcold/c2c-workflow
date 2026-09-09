import { Module } from '@nestjs/common'
import { MenuBootstrapService } from './menu-bootstrap.service'
import { MenuController } from './menu.controller'
import { MenuRegistryService } from './menu-registry.service'
import { MenuService } from './menu.service'

@Module({
  imports: [],
  controllers: [MenuController],
  providers: [MenuService, MenuRegistryService, MenuBootstrapService],
  exports: [MenuService, MenuRegistryService],
})
export class MenuModule {}
