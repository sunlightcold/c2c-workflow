import { getCurrentBusinessDateParts } from '@/common/time'
import { customAlphabet } from 'nanoid'

const numId = customAlphabet('1234567890')
const usernameAlpha = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz')

/**
 * 生成唯一文件ID
 */
function generateFileId() {
  const date = getTimestampIdPart()
  const num = numId(10)
  return `${date}${num}`
}

/**
 * 生成指定长度的纯数字随机码
 */
function generateNumberCode(length = 6) {
  return numId(length)
}

/**
 * 生成指定长度的随机字符串（包含小写字母与数字）
 */
function generateRandomStr(length = 8) {
  return usernameAlpha(length)
}

function generateBusinessNo(prefix: string, randomLength = 6) {
  const date = getTimestampIdPart()
  const random = numId(randomLength)
  return `${prefix}${date}${random}`
}

function getTimestampIdPart() {
  return getCurrentBusinessDateParts().compactDateTime
}

export const IdUtils = {
  generateFileId,
  generateNumberCode,
  generateRandomStr,
  generateBusinessNo,
}
