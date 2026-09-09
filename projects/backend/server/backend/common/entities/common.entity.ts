import { PrimaryGeneratedColumn } from 'typeorm'
import { TimestampEntity } from './timestamp.entity'

export abstract class CommonEntity extends TimestampEntity {
  @PrimaryGeneratedColumn()
  id: number
}

export abstract class CommonUuidEntity extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string
}
