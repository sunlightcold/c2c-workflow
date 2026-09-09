import { BadRequestException, Injectable } from '@nestjs/common'
import { normalizeStorageKeyPrefix, type StoragePurposeDefinition } from './storage.types'

export const SYSTEM_AVATAR_STORAGE_PURPOSE = 'system.avatar'
export const SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE = 'system.tutorial-content'

export const PLATFORM_DEFAULT_STORAGE_PURPOSES = [
  SYSTEM_AVATAR_STORAGE_PURPOSE,
  SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE,
] as const

const SYSTEM_STORAGE_PURPOSES: StoragePurposeDefinition[] = [
  {
    code: SYSTEM_AVATAR_STORAGE_PURPOSE,
    group: 'system',
    keyPrefix: 'avatars/',
    maxSizeBytes: 200 * 1024,
    allowedMimeTypes: ['image/webp'],
    visibility: 'public',
  },
  {
    code: SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE,
    group: 'system',
    keyPrefix: 'tutorials/content/',
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'],
    visibility: 'public',
  },
]

@Injectable()
export class StoragePurposeRegistry {
  private readonly definitions = new Map<string, StoragePurposeDefinition>()

  constructor() {
    this.registerMany(SYSTEM_STORAGE_PURPOSES)
  }

  get(code: string): StoragePurposeDefinition {
    const definition = this.definitions.get(code)
    if (!definition) throw new BadRequestException(`Unknown storage purpose: ${code}`)
    return definition
  }

  list(): StoragePurposeDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.code.localeCompare(right.code))
  }

  register(definition: StoragePurposeDefinition): void {
    const code = definition.code.trim()
    if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(code)) {
      throw new Error(`Invalid storage purpose code: ${definition.code}`)
    }
    if (this.definitions.has(code)) throw new Error(`Duplicate storage purpose: ${code}`)
    let keyPrefix: string
    try {
      keyPrefix = normalizeStorageKeyPrefix(definition.keyPrefix)
    } catch {
      throw new Error(`Invalid storage purpose keyPrefix: ${code}`)
    }
    this.definitions.set(code, { ...definition, code, keyPrefix })
  }

  registerMany(definitions: readonly StoragePurposeDefinition[]): void {
    for (const definition of definitions) this.register(definition)
  }
}
