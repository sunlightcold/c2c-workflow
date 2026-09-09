import { Injectable } from '@nestjs/common'

@Injectable()
export class StoragePublicAccessProbe {
  async read(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new Error(`Public object request failed with HTTP ${response.status}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }
}
