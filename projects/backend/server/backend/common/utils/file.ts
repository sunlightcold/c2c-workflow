import { nanoid } from 'nanoid'
import { posix } from 'path'

/**
 * 生成归类存储路径和唯一文件名
 * @param userId 用户ID (用于区分所有者)
 * @param module 业务模块 (如: 'avatars', 'chat', 'records')
 * @param originalName 原始文件名或文件后缀 (如: 'image.png' 或 '.png')
 * @returns { dirPath, fileName, fullPath }
 */
function generateFilePath(userId: string | number, module: string, originalName: string) {
  // 1. 获取文件后缀名
  const ext = posix.extname(originalName) || ''

  // 2. 获取当前日期 (用于按年/月分库，防止单个文件夹文件过多)
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  // 3. 构造文件夹路径 (逻辑路径，不包含根目录)
  // 格式: /业务模块/年/月/日
  // 例如: /avatars/2023/10/25/
  const dirPath = posix.join('/', module, String(year), month, day)

  // 4. 构造唯一文件名
  // 格式: 用户ID-随机字符串-时间戳.后缀
  // 加入 userId 是为了方便在文件系统中一眼识别归属，加入随机串防止碰撞
  const uniqueId = nanoid(8) // 8位随机码
  const timestamp = Date.now()
  const fileName = `${userId}_${timestamp}_${uniqueId}${ext}`

  const fullPath = posix.join(dirPath, fileName).replace(/\\/g, '/')

  return {
    dirPath,
    fileName,
    fullPath,
    ext,
  }
}

export const FileUtils = {
  generateFilePath,
}
