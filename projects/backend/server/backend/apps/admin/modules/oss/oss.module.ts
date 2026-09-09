import { Module } from '@nestjs/common'
import { OssController } from './oss.controller'

@Module({
  controllers: [OssController],
})
export class OssModule {}
