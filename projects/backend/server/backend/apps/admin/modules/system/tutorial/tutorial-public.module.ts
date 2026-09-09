import { Module } from '@nestjs/common'
import { TutorialPublicController } from './tutorial-public.controller'
import { TutorialCoreModule } from './tutorial-core.module'

@Module({
  imports: [TutorialCoreModule],
  controllers: [TutorialPublicController],
})
export class TutorialPublicModule {}
