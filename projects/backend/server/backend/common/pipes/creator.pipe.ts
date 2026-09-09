import { ArgumentMetadata, Inject, Injectable, PipeTransform } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { OperatorDto } from '../dto'
import { IRequest } from '../interfaces'

@Injectable()
export class CreatorPipe implements PipeTransform {
  constructor(@Inject(REQUEST) private readonly request: IRequest) {}

  transform(value: OperatorDto, _metadata: ArgumentMetadata) {
    const user = this.request.user

    value.createBy = user.uid
    // 创建默认更新人为创建人
    value.updateBy = user.uid

    return value
  }
}
