import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'

/** Session lock spans committed pending state and upstream IO; no long DB transaction. */
@Injectable()
export class AdLockService {
  constructor(private readonly dataSource: DataSource) {}

  async run<T>(
    tenantId: string,
    merchantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    const key = `c2c-ad:${tenantId}:${merchantId}`
    let locked = false
    try {
      const [result] = await runner.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
        [key],
      )
      locked = result.locked
      if (!locked) throw new ConflictException('该商家正在同步或调价，请稍后重试')
      return await work(runner.manager)
    } finally {
      if (locked) await runner.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
      await runner.release()
    }
  }
}
