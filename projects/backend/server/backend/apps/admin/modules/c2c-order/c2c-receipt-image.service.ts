import { Injectable } from '@nestjs/common'
import { readdirSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Poppler } from 'node-poppler'
import sharp from 'sharp'

export interface C2cReceiptImage {
  content: Buffer
  fileName: string
  height: number
  width: number
}

@Injectable()
export class C2cReceiptImageService {
  private readonly poppler = this.createPoppler()

  async convert(pdf: Buffer, orderNo: string): Promise<C2cReceiptImage[]> {
    const directory = await mkdtemp(join(tmpdir(), 'c2c-receipt-'))
    const prefix = join(directory, 'page')
    try {
      await this.poppler.pdfToCairo(pdf, prefix, {
        jpegFile: true,
        jpegOptions: 'quality=88,optimize=y',
        resolutionXYAxis: 150,
      })
      const names = (await readdir(directory))
        .filter((name) => /^page-\d+\.jpg$/i.test(name))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      if (!names.length) throw new Error('回单 PDF 转图片失败：未生成图片')
      if (names.length > 5) throw new Error('回单最多支持 5 页')

      return Promise.all(
        names.map(async (name, index) => {
          const content = await sharp(await readFile(join(directory, name)))
            .rotate()
            .resize({ width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 88 })
            .toBuffer()
          const metadata = await sharp(content).metadata()
          if (!metadata.width || !metadata.height) {
            throw new Error(`回单第 ${index + 1} 页图片尺寸无效`)
          }
          return {
            content,
            fileName: `${orderNo}-${index + 1}.jpg`,
            width: metadata.width,
            height: metadata.height,
          }
        }),
      )
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  }

  private createPoppler(): Poppler {
    if (process.platform !== 'win32') return new Poppler()

    const packageRoot = dirname(createRequire(__filename).resolve('node-poppler/package.json'))
    const bundledRoot = join(packageRoot, 'src', 'lib', 'win32')
    const bundleName = readdirSync(bundledRoot, { withFileTypes: true }).find(
      (entry) => entry.isDirectory() && entry.name.startsWith('poppler-'),
    )?.name
    if (!bundleName) throw new Error('node-poppler 内置 Windows 运行库不存在')
    return new Poppler(join(bundledRoot, bundleName, 'Library', 'bin'))
  }
}
