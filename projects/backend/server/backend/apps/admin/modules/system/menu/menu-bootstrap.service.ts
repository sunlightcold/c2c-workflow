import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { MenuRegistryService } from './menu-registry.service'

@Injectable()
export class MenuBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(MenuBootstrapService.name)

  constructor(private readonly menuRegistryService: MenuRegistryService) {}

  async onModuleInit() {
    await this.menuRegistryService.syncDefaultMenus()
    this.logger.log('系统默认菜单注册完成')
  }
}
