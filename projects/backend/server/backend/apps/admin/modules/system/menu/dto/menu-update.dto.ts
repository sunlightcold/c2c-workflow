import { PartialType } from '@nestjs/swagger'
import { MenuCreateDto } from './menu-create.dto'

export class MenuUpdateDto extends PartialType(MenuCreateDto) {}
