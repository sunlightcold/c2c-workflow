import { PaginationDto } from '@/common/dto'
import { IntersectionType } from '@nestjs/swagger'
import { MenuListDto } from './menu-list.dto'

export class MenuFilterDto extends IntersectionType(PaginationDto, MenuListDto) {}
