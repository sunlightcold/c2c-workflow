import type { ValueTransformer } from 'typeorm'

/**
 * 将数据库中查询出来的 bigint（会被底层驱动解析为 string）自动转换为 number。
 * 解决 13 位毫秒级时间戳被解析为字符串导致 === 严格相等判断失败的问题。
 */
export const BigintToNumberTransformer: ValueTransformer = {
  to: (entityValue: number | undefined | null) => {
    // 写入数据库前，保持 number 或转为对应的格式
    return entityValue
  },
  from: (databaseValue: string | number | undefined | null): number | null => {
    // 从数据库读取后，如果是字符串，则进行转换（防备为空的情况）
    if (databaseValue === null || databaseValue === undefined) {
      return null
    }
    return Number(databaseValue)
  },
}
