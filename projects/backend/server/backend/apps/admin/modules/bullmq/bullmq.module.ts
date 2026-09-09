import { BullModule } from '@nestjs/bullmq'
import { Global, Module } from '@nestjs/common'
import { createBullMqRootOptions } from './bullmq.config'

@Global()
@Module({
  imports: [BullModule.forRoot(createBullMqRootOptions())],
})
export class BullMqModule {}
