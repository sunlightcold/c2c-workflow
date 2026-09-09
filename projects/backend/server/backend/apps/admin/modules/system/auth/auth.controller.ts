import { definePermission, Permission, Public, User } from '@/common/decorators'
import { AuthUser, IRequest } from '@/common/interfaces'
import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { EnabledOtpDto, LoginDto, ModifyPwdDto, RegisterDto } from './dto'

const Permissions = definePermission('sys:auth', [
  'enabled_otp',
  'disabled_otp',
  'modify_pwd',
] as const)

@ApiTags('认证管理')
@Controller('auth')
export class AuthController {
  @Inject(AuthService) private readonly authService: AuthService

  @Post('login')
  @ApiOperation({ summary: '用户名密码登录' })
  @ApiBody({ description: '参数', type: LoginDto })
  @Public()
  async login(@Body() body: LoginDto) {
    return await this.authService.login(body)
  }

  @Post('logout')
  @ApiOperation({ summary: '退出登录' })
  @Public()
  async logout(@Req() req: IRequest) {
    if (req.accessToken) {
      return this.authService.logout(req.accessToken)
    }
  }

  @Post('register')
  @ApiOperation({ summary: '注册' })
  @ApiBody({ description: '参数', type: RegisterDto })
  @Public()
  register(@Body() body: RegisterDto) {
    return this.authService.register(body)
  }

  @Get('captcha')
  @ApiOperation({ summary: '获取图形验证码' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  async getCaptcha(@Query('width') width: number, @Query('height') height: number) {
    const result = await this.authService.getCaptcha(width, height)
    return result
  }

  @Get('menus')
  @ApiOperation({ summary: '查询用户前端菜单' })
  findFrontendMenus(@User() user: AuthUser) {
    return this.authService.getFrontendMenus(user.uid)
  }

  @Get('permissions')
  @ApiOperation({ summary: '查询用户权限' })
  getPermissions(@User() user: AuthUser) {
    return this.authService.getPermissions(user.uid)
  }

  @Get('optUrl')
  @ApiOperation({ summary: '获取 OPT URL' })
  getOTPUrl(@Req() req: IRequest) {
    return this.authService.getOTPUrl(req.user)
  }

  @Put('enabledOtp')
  @ApiOperation({ summary: '绑定 OTP' })
  @ApiBody({ description: '参数', type: EnabledOtpDto })
  @Permission(Permissions.ENABLED_OTP)
  bindOTPUrl(@Body() body: EnabledOtpDto, @Req() req: IRequest) {
    return this.authService.enabledOTP(body, req.user)
  }

  @Put('disabledOtp/:code')
  @ApiOperation({ summary: '解绑 OTP' })
  @ApiParam({ name: 'code', description: '验证码' })
  @Permission(Permissions.DISABLED_OTP)
  unBindOtp(@Param('code') code: string, @User() user: AuthUser) {
    return this.authService.disabledOTP(code, user)
  }

  @Put('modifyPwd')
  @ApiOperation({ summary: '更换密码' })
  @Permission(Permissions.MODIFY_PWD)
  modifyPwd(@Body() body: ModifyPwdDto, @User() user: AuthUser) {
    return this.authService.modifyPwd(user.uid, body)
  }
}
