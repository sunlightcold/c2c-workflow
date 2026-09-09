import { ValidationMatch } from '@/common/utils'
import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, Matches } from 'class-validator'

export class LoginDto {
  @Matches(ValidationMatch.username.regExp, {
    message: ValidationMatch.username.message,
  })
  @ApiProperty({ type: String, description: '用户名', required: true, maxLength: 20 })
  username: string

  @Matches(ValidationMatch.password.regExp, {
    message: ValidationMatch.password.message,
  })
  @ApiProperty({ type: String, description: '用户密码', required: true, maxLength: 40 })
  password: string

  @IsOptional()
  @Matches(ValidationMatch.code4.regExp, {
    message: ValidationMatch.code4.message,
  })
  @ApiProperty({ type: String, description: '验证码', required: true })
  code: string

  @IsOptional()
  @Matches(ValidationMatch.code6.regExp, {
    message: ValidationMatch.code6.message,
  })
  @ApiProperty({ type: String, description: 'OTP 验证码', required: true })
  otpCode: string

  @IsString({ message: '唯一码错误' })
  @ApiProperty({ type: String, description: '图形验证唯一码', required: true })
  uuid: string
}

export class RegisterDto extends LoginDto {}

export class EnabledOtpDto {
  @IsOptional()
  @Matches(ValidationMatch.code6.regExp, {
    message: ValidationMatch.code6.message,
  })
  @ApiProperty({ type: String, description: 'OPT 验证码', required: true })
  code: string

  @IsString({ message: '唯一码错误' })
  @ApiProperty({ type: String, description: '唯一码', required: true })
  uuid: string
}

export class ModifyPwdDto {
  @IsOptional()
  @ApiProperty({ type: String, description: 'OPT 验证码', required: false })
  code: string

  @IsOptional()
  @Matches(ValidationMatch.password.regExp, {
    message: ValidationMatch.password.message,
  })
  @ApiProperty({ type: String, description: '旧密码', required: true })
  oldPwd: string

  @IsOptional()
  @Matches(ValidationMatch.password.regExp, {
    message: ValidationMatch.password.message,
  })
  @ApiProperty({ type: String, description: '原密码', required: true })
  newPwd: string
}
