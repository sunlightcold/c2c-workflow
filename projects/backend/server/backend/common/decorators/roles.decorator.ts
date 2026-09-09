import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = Symbol('IS_PUBLIC_KEY')
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const IS_OPTIONAL_AUTH_KEY = Symbol('IS_OPTIONAL_AUTH_KEY')
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true)
