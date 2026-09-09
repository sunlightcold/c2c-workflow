import { forwardRef, Module } from '@nestjs/common'
import { MenuModule } from '../menu/menu.module'
import { UserModule } from '../user'
import { RoleController } from './role.controller'
import { RoleService } from './role.service'

@Module({
  imports: [UserModule, forwardRef(() => MenuModule)],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
