import type { INestApplication } from '@nestjs/common'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { HttpExceptionFilter } from '@/common/filters/http-exception'
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor'
import { json, type Request, type Response, type NextFunction } from 'express'

export function configureAdminHttpApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('v1')
  const parseProxyJson = json({ limit: '10mb' })
  // Keep a distinct middleware name so Nest still installs its default parser on other routes.
  app.use('/v1/sys/proxies', (req: Request, res: Response, next: NextFunction) =>
    parseProxyJson(req, res, next),
  )

  app.useGlobalPipes(
    new ValidationPipe({
      transformOptions: {
        enableImplicitConversion: true,
      },
      whitelist: true,
      stopAtFirstError: true,
      dismissDefaultMessages: false,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(
          errors.map((err) => Object.values(err.constraints || {}).join(', ')).join('; '),
        ),
    }),
  )
  app.useGlobalFilters(new HttpExceptionFilter())
  app.useGlobalInterceptors(new ResponseInterceptor())

  return app
}
