import './bootstrap/timezone.bootstrap'

import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
// import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { assertRuntimeConfig, getConfig } from '@/common/utils'
import { WinstonModule, utilities } from 'nest-winston'
import winston, { createLogger, transports } from 'winston'
import 'winston-daily-rotate-file'
import { AppModule } from './app.module'
import { configureAdminHttpApp } from './configure-app'

declare const module: any

async function bootstrap() {
  assertRuntimeConfig()
  const { env = 'production' } = getConfig('common')

  // 日志输出配置
  const instance = createLogger({
    // options of Winston
    transports: [
      new transports.Console({
        level: env === 'development' ? 'debug' : 'info',
        format: winston.format.combine(winston.format.timestamp(), utilities.format.nestLike()),
      }),
      // 滚动日志配置
      new winston.transports.DailyRotateFile({
        filename: 'app-%DATE%.log',
        dirname: 'logs',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.simple(),
        ),
      }),
    ],
  })

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger({
      instance,
    }),
  })
  app.enableShutdownHooks()
  app.set('trust proxy', 'loopback') // Trust requests from the loopback address

  configureAdminHttpApp(app)

  // swagger 文档配置
  // const config = new DocumentBuilder()
  //   .setTitle('PAY API')
  //   .setDescription('PAY API description')
  //   .setVersion('1.0')
  //   .addTag('PAY')
  //   .addBearerAuth()
  //   .build()
  // const documentFactory = () => SwaggerModule.createDocument(app, config)
  // SwaggerModule.setup('api', app, documentFactory)

  const adminConfig = getConfig('admin')
  await app.listen(adminConfig.port, () => {
    console.info(`server start in port ${adminConfig.port}`)
  })

  // 启用热更新
  if (module.hot) {
    module.hot.accept()
    module.hot.dispose(() => app.close())
  }
}
bootstrap()
