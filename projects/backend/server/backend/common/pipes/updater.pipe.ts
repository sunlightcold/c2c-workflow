import { ArgumentMetadata, Inject, Injectable, PipeTransform } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { OperatorDto } from '../dto'
import { IRequest } from '../interfaces'

@Injectable()
export class UpdaterPipe implements PipeTransform {
  constructor(@Inject(REQUEST) private readonly request: IRequest) {}

  transform(value: OperatorDto, _metadata: ArgumentMetadata) {
    const user = this.request.user

    value.updateBy = user.uid

    return value
  }
}
