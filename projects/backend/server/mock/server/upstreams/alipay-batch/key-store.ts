import { generateKeyPairSync } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { AlipayTestKeys } from './types'

let keyPromise: Promise<AlipayTestKeys> | undefined

function createPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
}

async function loadOrCreateKeys(): Promise<AlipayTestKeys> {
  const directory = resolve(process.env.MOCK_DATA_DIR ?? '.data')
  const file = resolve(directory, 'alipay-keys.json')
  try {
    return JSON.parse(await readFile(file, 'utf8')) as AlipayTestKeys
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const app = createPair()
  const alipay = createPair()
  const keys: AlipayTestKeys = {
    appPrivateKey: app.privateKey,
    appPublicKey: app.publicKey,
    alipayPrivateKey: alipay.privateKey,
    alipayPublicKey: alipay.publicKey,
  }
  await mkdir(directory, { recursive: true })
  await writeFile(file, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 })
  return keys
}

export function getAlipayTestKeys() {
  keyPromise ??= loadOrCreateKeys()
  return keyPromise
}
