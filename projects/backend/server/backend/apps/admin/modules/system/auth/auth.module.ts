import { getConfig } from '@/common/utils'
import { StaticModule } from '@admin/modules/static'
import { MenuModule, OnlineModule } from '@admin/modules/system'
import { UserModule } from '@admin/modules/system/user'
import { forwardRef, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtConstants } from './constants'
import { AccountController } from './controllers'
import { RbacAuthGuard } from './guards'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { AccountService } from './services'
import { IJwtService } from './services/jwt.service'
import { JwtStrategy } from './strategies'

const config = getConfig('admin')

@Module({
  imports: [
    UserModule,
    MenuModule,
    StaticModule,
    PassportModule,
    forwardRef(() => OnlineModule),
    JwtModule.register({
      secret: JwtConstants.secret,
      signOptions: { expiresIn: config.accessTokenExpiresIn },
    }),
  ],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    IJwtService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacAuthGuard },
  ],
  exports: [AuthService, IJwtService],
})
export class AuthModule {}
