import { Module } from '@nestjs/common'
import { ClientErrorAdminController, ClientErrorIngestController } from './client-error.controller'
import { ClientErrorService } from './client-error.service'

@Module({
  controllers: [ClientErrorIngestController, ClientErrorAdminController],
  providers: [ClientErrorService],
  exports: [ClientErrorService],
})
export class ClientErrorModule {}
