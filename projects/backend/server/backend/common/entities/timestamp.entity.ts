import { BaseEntity, CreateDateColumn, UpdateDateColumn } from 'typeorm'

export abstract class TimestampEntity extends BaseEntity {
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
