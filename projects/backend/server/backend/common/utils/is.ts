export {
  isArguments,
  isArray,
  isArrayBuffer,
  isArrayLike,
  isArrayLikeObject,
  isBoolean,
  isBuffer,
  isDate,
  isElement,
  isEmpty,
  isEqual,
  isEqualWith,
  isError,
  isFinite,
  isFunction,
  isLength,
  isMap,
  isMatch,
  isMatchWith,
  isNative,
  isNil,
  isNull,
  isNumber,
  isObjectLike,
  isPlainObject,
  isRegExp,
  isSafeInteger,
  isSet,
  isString,
  isSymbol,
  isTypedArray,
  isUndefined,
  isWeakMap,
  isWeakSet,
} from 'lodash'

const toString = Object.prototype.toString

export function is(val: unknown, type: string) {
  return toString.call(val) === `[object ${type}]`
}

export function isDef<T = unknown>(val?: T): val is T {
  return typeof val !== 'undefined'
}

export function isObject(val: any): val is Record<any, any> {
  return val !== null && is(val, 'Object')
}

export function isWindow(val: any): val is Window {
  return typeof window !== 'undefined' && is(val, 'Window')
}

export const isServer = typeof window === 'undefined'

export const isClient = !isServer

export function isHttpUrl(path: string): boolean {
  const reg = /(http|https):\/\/([\w.]+\/?)\S*/gi
  return reg.test(path)
}

export function isPascalCase(str: string): boolean {
  const regex = /^[A-Z][A-Za-z]*$/
  return regex.test(str)
}
