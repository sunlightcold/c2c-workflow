import type { MigrationInterface } from 'typeorm'
import { TutorialCenter1785000000000 } from './tutorial-center.migration'
import { TutorialContentStoragePurpose1785005000000 } from './tutorial-content-storage-purpose.migration'
import { AiGateway1785005500000 } from './ai-gateway.migration'
import { AiGatewayChannelCapacity1785005600000 } from './ai-gateway-channel-capacity.migration'
import { ObjectStorageCenter1785001000000 } from './object-storage-center.migration'
import { ObjectStoragePurposePrefix1785002000000 } from './object-storage-purpose-prefix.migration'
import { ClientErrorEvents1785008000000 } from './client-error-events.migration'
import { AiCallLogs1787001000000 } from './ai-call-logs.migration'

export type AdminMigrationConstructor = new () => MigrationInterface

export const adminMigrations: AdminMigrationConstructor[] = [
  TutorialCenter1785000000000,
  ObjectStorageCenter1785001000000,
  ObjectStoragePurposePrefix1785002000000,
  TutorialContentStoragePurpose1785005000000,
  AiGateway1785005500000,
  AiGatewayChannelCapacity1785005600000,
  ClientErrorEvents1785008000000,
  AiCallLogs1787001000000,
]
