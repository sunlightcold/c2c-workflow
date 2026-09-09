import { Module } from '@nestjs/common'
import { TutorialCoreModule } from './tutorial-core.module'
import { TutorialAdminController } from './tutorial-admin.controller'

@Module({
  imports: [TutorialCoreModule],
  controllers: [TutorialAdminController],
})
export class TutorialAdminModule {}
