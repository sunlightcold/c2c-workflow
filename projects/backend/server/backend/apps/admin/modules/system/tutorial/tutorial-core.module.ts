import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TutorialEntity } from '@admin/database/system/tutorial.entity'
import { TutorialService } from './tutorial.service'

@Module({
  imports: [TypeOrmModule.forFeature([TutorialEntity])],
  providers: [TutorialService],
  exports: [TutorialService],
})
export class TutorialCoreModule {}
