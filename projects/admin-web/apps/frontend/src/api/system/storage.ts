import { requestClient } from '#/api/request';

export namespace StorageApi {
  export type ChannelStatus = 'active' | 'disabled' | 'error';
  export type StoragePurposeGroup = 'app' | 'system';
  export type StorageVisibility = 'private' | 'public';

  export interface Channel {
    accessKeyId: string;
    bucket: string;
    code: string;
    credentialVersion: number;
    endpoint: string;
    forcePathStyle: boolean;
    hasSecret: boolean;
    id: string;
    lastCheckedAt: null | string;
    lastCheckMessage: null | string;
    name: string;
    provider: 's3_compatible';
    publicBaseUrl: null | string;
    region: string;
    status: ChannelStatus;
    updatedAt: string;
  }

  export interface ChannelInput {
    accessKeyId: string;
    bucket: string;
    code: string;
    endpoint: string;
    forcePathStyle: boolean;
    name: string;
    provider: 's3_compatible';
    publicBaseUrl?: string;
    region: string;
    secretAccessKey: string;
  }

  export interface StoragePurpose {
    allowedMimeTypes: string[];
    bindingChannelId: null | string;
    bindingChannelName: null | string;
    code: string;
    defaultKeyPrefix: string;
    group: StoragePurposeGroup;
    keyPrefixOverride: null | string;
    keyPrefix: string;
    maxSizeBytes: number;
    visibility: StorageVisibility;
  }
}

export function createStorageChannelApi(data: StorageApi.ChannelInput) {
  return requestClient.post<StorageApi.Channel>('/sys/storage/channels', data);
}

export function disableStorageChannelApi(id: string) {
  return requestClient.post<StorageApi.Channel>(
    `/sys/storage/channels/${id}/disable`,
  );
}

export function enableStorageChannelApi(id: string) {
  return requestClient.post<StorageApi.Channel>(
    `/sys/storage/channels/${id}/enable`,
  );
}

export function getStorageChannelsApi() {
  return requestClient.get<StorageApi.Channel[]>('/sys/storage/channels');
}

export function getStoragePurposesApi() {
  return requestClient.get<StorageApi.StoragePurpose[]>(
    '/sys/storage/purposes',
  );
}

export function removeStorageChannelApi(id: string) {
  return requestClient.delete(`/sys/storage/channels/${id}`);
}

export function rotateStorageChannelCredentialsApi(
  id: string,
  data: Pick<StorageApi.ChannelInput, 'accessKeyId' | 'secretAccessKey'>,
) {
  return requestClient.put<StorageApi.Channel>(
    `/sys/storage/channels/${id}/credentials`,
    data,
  );
}

export function testStorageChannelApi(id: string) {
  return requestClient.post<StorageApi.Channel>(
    `/sys/storage/channels/${id}/test`,
  );
}

export function updateStorageChannelApi(
  id: string,
  data: Pick<StorageApi.ChannelInput, 'name'> & {
    publicBaseUrl?: null | string;
  },
) {
  return requestClient.put<StorageApi.Channel>(
    `/sys/storage/channels/${id}`,
    data,
  );
}

export function updateStoragePurposeBindingApi(
  purposeCode: string,
  channelId: string,
  keyPrefixOverride?: null | string,
) {
  return requestClient.put<StorageApi.StoragePurpose>(
    `/sys/storage/purposes/${purposeCode}/binding`,
    { channelId, keyPrefixOverride: keyPrefixOverride || null },
  );
}
