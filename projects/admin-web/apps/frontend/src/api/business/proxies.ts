import { requestClient } from '#/api/request';

export type ProxyProtocol = 'http' | 'https' | 'socks5' | 'socks5h';
export interface ProxyTest {
  success: boolean;
  message: string;
  latency_ms?: number;
  ip_address?: string;
  country?: string;
  country_code?: string;
  checked_at?: number;
}
export interface ProxyQuality {
  score: number;
  grade: string;
  summary: string;
  checked_at: number;
  items: Array<{
    cf_ray?: string;
    http_status?: number;
    latency_ms?: number;
    message: string;
    status: string;
    target: string;
  }>;
}
export interface IpProxy {
  id: string;
  name: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username: string;
  password_configured: boolean;
  status: 'active' | 'expired' | 'inactive';
  expires_at: null | number;
  expiry_warn_days: number;
  fallback_mode: 'direct' | 'none' | 'proxy';
  backup_proxy_id: null | string;
  account_count: number;
  created_at: string;
  last_test: null | ProxyTest;
  last_quality: null | ProxyQuality;
}
export interface ProxyInput {
  name?: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  status?: 'active' | 'inactive';
  expires_at?: null | number;
  expiry_warn_days?: number;
  fallback_mode?: 'direct' | 'none' | 'proxy';
  backup_proxy_id?: null | string;
}
export interface ProxyQuery {
  tenantId: string;
  page?: number;
  page_size?: number;
  search?: string;
  protocol?: string;
  status?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  ids?: string;
}
const base = '/sys/proxies';
export const listProxies = (params: ProxyQuery) =>
  requestClient.get<{ items: IpProxy[]; total: number }>(base, { params });
export const allProxies = (tenantId: string) =>
  requestClient.get<IpProxy[]>(`${base}/all`, { params: { tenantId } });
export const createProxy = (tenantId: string, input: ProxyInput) =>
  requestClient.post<IpProxy>(base, { ...input, tenantId });
export const updateProxy = (
  tenantId: string,
  id: string,
  input: Partial<ProxyInput>,
) => requestClient.put<IpProxy>(`${base}/${id}`, { ...input, tenantId });
export const batchCreateProxies = (tenantId: string, proxies: ProxyInput[]) =>
  requestClient.post<{ created: number; skipped: number }>(`${base}/batch`, {
    tenantId,
    proxies,
  });
export const deleteProxy = (tenantId: string, id: string) =>
  requestClient.delete(`${base}/${id}`, { params: { tenantId } });
export const deleteProxies = (tenantId: string, ids: string[]) =>
  requestClient.post<{
    deleted_ids: string[];
    failed: Array<{ id: string; reason: string }>;
  }>(`${base}/batch-delete`, { tenantId, ids });
export const testProxy = (tenantId: string, id: string) =>
  requestClient.post<ProxyTest>(`${base}/${id}/test`, undefined, {
    params: { tenantId },
    timeout: 30_000,
  });
export const checkProxyQuality = (tenantId: string, id: string) =>
  requestClient.post<ProxyQuality>(`${base}/${id}/quality-check`, undefined, {
    params: { tenantId },
    timeout: 100_000,
  });
export const getProxyAccounts = (tenantId: string, id: string) =>
  requestClient.get<
    Array<{ id: string; name: string; platform: string; status: string }>
  >(`${base}/${id}/accounts`, { params: { tenantId } });
export const bindMerchantProxy = (
  tenantId: string,
  merchantId: string,
  proxyId: null | string,
) => requestClient.put(`${base}/bindings/${merchantId}`, { tenantId, proxyId });
