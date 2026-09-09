import { Global, Module } from '@nestjs/common'
import { ParamsController } from './params.controller'
import { ParamsBootstrapService } from './params-bootstrap.service'
import { ParamsService } from './params.service'

@Global()
@Module({
  imports: [],
  controllers: [ParamsController],
  providers: [ParamsService, ParamsBootstrapService],
  exports: [ParamsService],
})
export class ParamsModule {}
