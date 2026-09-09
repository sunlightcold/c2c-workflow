import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ParamsService } from './params.service'

@Injectable()
export class ParamsBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(ParamsBootstrapService.name)

  constructor(private readonly paramsService: ParamsService) {}

  async onModuleInit() {
    await this.paramsService.syncSystemParams()
    await this.paramsService.initRedis()
    this.logger.log('系统默认参数注册完成')
  }
}
