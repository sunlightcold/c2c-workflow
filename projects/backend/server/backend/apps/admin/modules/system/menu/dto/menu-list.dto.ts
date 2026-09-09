import { IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { MenuCreateDto } from './menu-create.dto'
import { MenuSystemFieldsDto } from './menu-system-fields.dto'

export class MenuListDto extends IntersectionType(
  PartialType(PickType(MenuCreateDto, ['name', 'status', 'type'])),
  PartialType(PickType(MenuSystemFieldsDto, ['source'])),
) {}
