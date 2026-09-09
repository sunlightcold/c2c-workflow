import type { INestApplication } from '@nestjs/common'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { HttpExceptionFilter } from '@/common/filters/http-exception'
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor'

export function configureAdminHttpApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('v1')

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
