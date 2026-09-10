import { createSign, createVerify } from 'node:crypto'

export function canonicalize(params: Record<string, string>, excluded = new Set(['sign'])) {
  return Object.keys(params)
    .filter((key) => !excluded.has(key) && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
}

export function signRsa2(content: string, privateKey: string) {
  return createSign('RSA-SHA256').update(content, 'utf8').sign(privateKey, 'base64')
}

export function verifyRsa2(content: string, signature: string, publicKey: string) {
  return createVerify('RSA-SHA256').update(content, 'utf8').verify(publicKey, signature, 'base64')
}
