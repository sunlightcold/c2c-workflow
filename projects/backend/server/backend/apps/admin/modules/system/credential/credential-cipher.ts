import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const CIPHER_VERSION = 'v1'

export function decryptCredential(value: string, masterKey: string): string {
  const [version, iv, tag, ciphertext] = value.split(':')
  if (version !== CIPHER_VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Stored credential is invalid')
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveCredentialKey(masterKey),
      Buffer.from(iv, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('Stored credential cannot be decrypted')
  }
}

export function encryptCredential(value: string, masterKey: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveCredentialKey(masterKey), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

function deriveCredentialKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey).digest()
}
