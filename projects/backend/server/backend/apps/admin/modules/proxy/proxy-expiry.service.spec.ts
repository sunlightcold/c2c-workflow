import type { ProxyFallbackNode } from './proxy-expiry.service'
import { resolveProxyFallback } from './proxy-expiry.service'

describe('sub2api expiry fallback semantics', () => {
  const proxy = (
    id: string,
    fallbackMode: ProxyFallbackNode['fallbackMode'] = 'none',
    backupProxyId: string | null = null,
    status: ProxyFallbackNode['status'] = 'active',
    expiresAt: Date | null = new Date(0),
  ): ProxyFallbackNode => ({ id, fallbackMode, backupProxyId, status, expiresAt })
  const resolve = (source: ProxyFallbackNode, ...rest: ProxyFallbackNode[]) =>
    resolveProxyFallback(source, new Map([source, ...rest].map((p) => [p.id, p])), Date.now())
  it('keeps none, selects direct, and stops on missing/cyclic paths', () => {
    expect(resolve(proxy('a'))).toBeUndefined()
    expect(resolve(proxy('a', 'direct'))).toBeNull()
    expect(resolve(proxy('a', 'proxy', 'missing'))).toBeUndefined()
    expect(resolve(proxy('a', 'proxy', 'b'), proxy('b', 'proxy', 'a'))).toBeUndefined()
  })
  it('walks expired/disabled backups and selects only active unexpired targets', () => {
    expect(
      resolve(
        proxy('a', 'proxy', 'b'),
        proxy('b', 'proxy', 'c', 'inactive', null),
        proxy('c', 'none', null, 'active', null),
      ),
    ).toBe('c')
    expect(
      resolve(proxy('a', 'proxy', 'b'), proxy('b', 'direct', null, 'inactive', null)),
    ).toBeNull()
    expect(
      resolve(proxy('a', 'proxy', 'b'), proxy('b', 'none', null, 'inactive', null)),
    ).toBeUndefined()
  })
})
