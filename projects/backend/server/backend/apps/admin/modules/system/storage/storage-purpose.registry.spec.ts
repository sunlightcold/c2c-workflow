import {
  StoragePurposeRegistry,
  SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE,
} from './storage-purpose.registry'

describe('StoragePurposeRegistry', () => {
  it('registers tutorial content as a public image purpose', () => {
    expect(new StoragePurposeRegistry().get(SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE)).toEqual({
      allowedMimeTypes: ['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'],
      code: 'system.tutorial-content',
      group: 'system',
      keyPrefix: 'tutorials/content/',
      maxSizeBytes: 10 * 1024 * 1024,
      visibility: 'public',
    })
  })
})
