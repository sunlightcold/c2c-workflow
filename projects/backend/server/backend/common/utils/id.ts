import { getCurrentBusinessDateParts } from '@/common/time'
import { randomInt } from 'node:crypto'

const NUMBER_ALPHABET = '1234567890'
const USERNAME_ALPHABET = '1234567890abcdefghijklmnopqrstuvwxyz'

function randomCharacters(alphabet: string, length: number) {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('')
}

export const BusinessNoPrefix = {
  AGENT: 'AGT',
  MERCHANT: 'MCH',
  PAYMENT_ACCOUNT: 'PAC',
  PAYMENT_BATCH: 'BAT',
  PAYMENT_ORDER: 'PAY',
  TELEGRAM_BOT: 'BOT',
} as const

/**
 * 生成唯一文件ID
 */
function generateFileId() {
  const date = getTimestampIdPart()
  const num = randomCharacters(NUMBER_ALPHABET, 10)
  return `${date}${num}`
}

/**
 * 生成指定长度的纯数字随机码
 */
function generateNumberCode(length = 6) {
  return randomCharacters(NUMBER_ALPHABET, length)
}

/**
 * 生成指定长度的随机字符串（包含小写字母与数字）
 */
function generateRandomStr(length = 8) {
  return randomCharacters(USERNAME_ALPHABET, length)
}

function generateBusinessNo(prefix: string, randomLength = 6) {
  const date = getTimestampIdPart()
  const random = randomCharacters(NUMBER_ALPHABET, randomLength)
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
