import { ApiProperty } from '@nestjs/swagger'

export const RESPONSE_SUCCESS_CODE = 200
export const RESPONSE_SUCCESS_MSG = 'success'

export class ResponseModel<T = any> {
  static success<T>(data: T, msg?: string) {
    return new ResponseModel(RESPONSE_SUCCESS_CODE, data, msg)
  }

  static error(code: number, msg: string) {
    return new ResponseModel(code, {}, msg)
  }

  @ApiProperty({ type: Object })
  data?: T

  @ApiProperty({ type: Number, default: RESPONSE_SUCCESS_CODE })
  code: number

  @ApiProperty({ type: String, default: RESPONSE_SUCCESS_MSG })
  msg: string

  @ApiProperty({ type: String })
  timestamp: string

  @ApiProperty({ type: String })
  path: string

  constructor(code: number, data: T, msg = RESPONSE_SUCCESS_MSG) {
    this.code = code
    this.data = data
    this.msg = msg
    this.timestamp = new Date().toISOString()
  }

  setPath(path: string) {
    this.path = path
    return this
  }
}
