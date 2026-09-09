import {
  ArgumentMetadata,
  FileTypeValidator,
  FileValidator,
  Injectable,
  MaxFileSizeValidator,
  ParseFilePipe,
  PipeTransform,
} from '@nestjs/common'

export interface ValidateFileOptions {
  maxFileSize?: number
  fileType?: string | RegExp
}

@Injectable()
export class ValidateFilePipe implements PipeTransform {
  constructor(private readonly options: ValidateFileOptions) {}
  async transform(value: Express.Multer.File, _metadata: ArgumentMetadata) {
    const { maxFileSize, fileType } = this.options
    const validators: FileValidator[] = []
    if (maxFileSize) {
      validators.push(
        new MaxFileSizeValidator({
          maxSize: maxFileSize,
          message: `单个文件大小不能超过${maxFileSize / 1024 / 1024}M`,
        }),
      )
    }
    if (fileType) {
      validators.push(new FileTypeValidator({ fileType }))
    }
    const parseFilePipe = new ParseFilePipe({ validators })
    return await parseFilePipe.transform(value)
  }
}
