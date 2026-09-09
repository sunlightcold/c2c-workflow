import { SysStorageBindingEntity, SysStorageChannelEntity } from '@admin/database'
import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AwsS3ObjectGateway } from './aws-s3-object.gateway'
import { LegacyObjectStorageImportService } from './legacy-object-storage-import.service'
import { StorageBindingService } from './storage-binding.service'
import { StorageChannelService } from './storage-channel.service'
import { StorageController } from './storage.controller'
import { StoragePurposeRegistry } from './storage-purpose.registry'
import { StoragePublicAccessProbe } from './storage-public-access.probe'
import { S3_OBJECT_GATEWAY } from './storage.types'
import { StorageService } from './storage.service'
import { CredentialModule } from '../credential'

@Global()
@Module({
  imports: [
    CredentialModule,
    TypeOrmModule.forFeature([SysStorageBindingEntity, SysStorageChannelEntity]),
  ],
  controllers: [StorageController],
  providers: [
    StoragePurposeRegistry,
    StoragePublicAccessProbe,
    AwsS3ObjectGateway,
    { provide: S3_OBJECT_GATEWAY, useExisting: AwsS3ObjectGateway },
    StorageChannelService,
    StorageBindingService,
    StorageService,
    LegacyObjectStorageImportService,
  ],
  exports: [LegacyObjectStorageImportService, StoragePurposeRegistry, StorageService],
})
export class StorageModule {}
