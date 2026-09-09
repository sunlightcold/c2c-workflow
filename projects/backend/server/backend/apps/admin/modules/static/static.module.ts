import { getConfig } from '@/common/utils'
import { Global, Module } from '@nestjs/common'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'
import { StaticController } from './static.controller'
import { StaticService } from './static.service'

const staticDirName = getConfig('admin').staticDirName

@Global()
@Module({
  imports: [
    ServeStaticModule.forRoot({
      serveRoot: '/public',
      rootPath: join(__dirname, '../', staticDirName, 'public'),
    }),
  ],
  controllers: [StaticController],
  providers: [StaticService],
  exports: [StaticService],
})
export class StaticModule {}
