import { TimestampEntity } from '@/common/entities'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

export const SysLogTableName = 'sys_log'

@Entity(SysLogTableName)
export class SysLogEntity extends TimestampEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ comment: '日志模块标题', type: 'varchar', length: 20, nullable: true })
  title: string

  @Column({ comment: '调用内容描述', type: 'text', nullable: true })
  content: string

  @Column({ comment: '调用方法', type: 'varchar' })
  serviceMethod: string

  @Column({ comment: '请求方式', type: 'varchar', length: 10, nullable: true })
  httpMethod: string

  @Column({ comment: 'ip地址', type: 'varchar', length: 50, nullable: true })
  ip: string

  @Column({ comment: '请求地址', type: 'varchar', length: 400, nullable: true })
  url: string

  @Column({ comment: '操作系统', type: 'varchar', length: 50, nullable: true })
  os: string

  @Column({ comment: '浏览器', type: 'varchar', length: 50, nullable: true })
  browser: string

  @Column({ comment: '城市', type: 'varchar', length: 50, nullable: true })
  city?: string

  @Column({ comment: '国家', type: 'varchar', length: 50, nullable: true })
  country?: string

  @Column({ comment: '地区/省', type: 'varchar', length: 50, nullable: true })
  region?: string

  @Column({ comment: '客户端 agent', type: 'varchar', length: 200, nullable: true })
  agent: string

  @Column({ comment: '操作人员', type: 'varchar', length: 100, nullable: true })
  username: string

  @Column({ comment: 'params 参数', type: 'text', nullable: true })
  params: string

  @Column({ comment: 'body 参数', type: 'text', nullable: true })
  body: string

  @Column({ comment: 'query 参数', type: 'text', nullable: true })
  query: string
}
