import { ErrorEnum } from '@/common/constants'
import { AuthUser } from '@/common/interfaces'
import {
  checkPwd,
  generateOtpSecretToken,
  generateSvgTextCaptcha,
  getConfig,
  getSaltMD5,
  validateOtpSecretToken,
} from '@/common/utils'
import { SysUserEntity } from '@admin/database'
import { CacheService } from '@admin/modules/cache'
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common'
import { isEmpty } from 'class-validator'
import { v4 as uuidv4 } from 'uuid'
import { OnlineService } from '..'
import { MenuService } from '../menu'
import { UserService } from '../user'
import { EnabledOtpDto, LoginDto, ModifyPwdDto, RegisterDto } from './dto'
import { IJwtService } from './services/jwt.service'

@Injectable()
export class AuthService {
  @Inject(UserService) private readonly userService: UserService
  @Inject(IJwtService) private readonly jwtService: IJwtService
  @Inject(CacheService) private readonly cacheService: CacheService
  @Inject(MenuService) private readonly menuService: MenuService
  @Inject(forwardRef(() => OnlineService)) private readonly onlineService: OnlineService

  getAuthUserByUser(user: SysUserEntity): AuthUser {
    const { username, id, actorType, tenantId, authzVersion } = user
    const payload = { username, uid: id, actorType, tenantId: tenantId ?? undefined, authzVersion }
    return payload
  }

  async login(dto: LoginDto) {
    const { username, password } = dto
    const user = await this.userService.findOneByUsername(username)
    if (!user) {
      throw new BadRequestException(ErrorEnum.INVALID_LOGIN_PARAMS)
    }
    // 验证验证器
    if (user.isOtpEnabled) {
      if (isEmpty(dto.otpCode)) throw new BadRequestException(ErrorEnum.INVALID_LOGIN_CODE)
      if (!validateOtpSecretToken(dto.otpCode, user.otpSecret!))
        throw new BadRequestException(ErrorEnum.INVALID_LOGIN_CODE)
    }
    // 验证密码
    checkPwd(password, user.password, user.salt)
    // 缓存菜单权限
    const permissions = await this.menuService.getPermissions(user.id)
    await this.cacheService.setPermissions(user.id, permissions)

    const payload = this.getAuthUserByUser(user)
    const accessToken = await this.jwtService.signAccessToken(payload)
    return { accessToken }
  }

  async logout(accessToken: string) {
    return await this.onlineService.clearLoginStatus(accessToken)
  }

  async checkCaptcha(uuid: string, code: string) {
    // 验证验证码
    const cacheCode = await this.cacheService.getCaptcha(uuid)
    if (!cacheCode) {
      throw new BadRequestException('验证码已过期')
    } else if (code.toLocaleLowerCase() !== cacheCode.toLocaleLowerCase()) {
      throw new BadRequestException(ErrorEnum.INVALID_LOGIN_CODE)
    }
  }

  async register(body: RegisterDto) {
    const { username, password } = body
    const isExit = await this.userService.checkUsernameExist(username)
    if (isExit) {
      throw new ConflictException(ErrorEnum.UN_UNIQUE_USERNAME)
    }
    const { uid } = await this.userService.create({ username, password })
    const user = await this.userService.findUserById(uid)
    const payload = this.getAuthUserByUser(user)
    const token = await this.jwtService.signAccessToken(payload)
    return token
  }

  async getCaptcha(width?: number, height?: number) {
    const uuid = uuidv4()
    const { data, text } = generateSvgTextCaptcha({ width, height })
    await this.cacheService.setCaptcha(uuid, text)
    return { data, uuid }
  }

  getPermissions(userId: number) {
    return this.menuService.getPermissions(userId)
  }

  async getFrontendMenus(userid: number) {
    return this.menuService.findFrontendMenus(userid)
  }

  async getOTPUrl(user: AuthUser) {
    const { uri, uuid, secret } = generateOtpSecretToken(
      user.username,
      getConfig('admin').sysPrefix,
    )
    await this.cacheService.setOTPCache(uuid, secret)
    return { uri, uuid }
  }

  async enabledOTP(body: EnabledOtpDto, user: AuthUser) {
    const secret = await this.cacheService.getOTPCache(body.uuid)
    if (!secret) throw new BadRequestException('验证已过期，请关闭后重新打开扫码验证')
    const flag = validateOtpSecretToken(body.code, secret)
    if (!flag) {
      throw new BadRequestException('验证码错误')
    }
    await this.userService.updateOtpSecret(user.uid, secret)
  }

  async disabledOTP(code: string, user: AuthUser) {
    await this.userService.checkUserOtpSecret(user.uid, code)
    await this.userService.disabledOtp(user.uid)
  }

  async modifyPwd(id: number, dto: ModifyPwdDto) {
    const user = await this.userService.findUserById(id)
    if (!user) throw new BadRequestException(ErrorEnum.INVALID_USER)
    const { oldPwd, newPwd, code } = dto
    if (user.isOtpEnabled) {
      if (isEmpty(code)) throw new BadRequestException('已绑定验证器，请输入验证码')
      if (!validateOtpSecretToken(code, user.otpSecret!))
        throw new BadRequestException('验证码错误')
    }
    const newMd5Pwd = getSaltMD5(newPwd, user.salt)
    // 验证密码
    checkPwd(oldPwd, user.password, user.salt, '原密码错误')
    if (user.password === newMd5Pwd) {
      throw new BadRequestException(ErrorEnum.INVALID_NEW_PWD)
    }
    await this.userService.modifyPwd(id, newMd5Pwd)
    await this.onlineService.offlineAllDeviceByUserid(user.id)
  }
}
