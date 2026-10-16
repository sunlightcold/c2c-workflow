import type { ProxyInput, ProxyProtocol } from '#/api/business/proxies';

// Keep this grammar identical to sub2api ProxiesView.vue (455d317d).
export function parseProxyUrl(line: string): null | ProxyInput {
  const match = line
    .trim()
    .match(
      /^(https?|socks5h?):\/\/(?:([^:@[\]]+):([^@[\]]+)@)?(\[[0-9a-f:.]+\]|[^:[\]]+):(\d+)$/i,
    );
  if (!match) return null;
  const port = Number.parseInt(match[5] ?? '', 10);
  const host = (match[4] ?? '').replaceAll(/^\[|\]$/g, '').trim();
  if (port < 1 || port > 65_535 || !host || /[\s/@?#[\]]/.test(host))
    return null;
  return {
    protocol: (match[1] ?? '').toLowerCase() as ProxyProtocol,
    host,
    port,
    username: match[2]?.trim() || '',
    password: match[3]?.trim() || '',
  };
}

export function parseProxyBatch(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const proxies: ProxyInput[] = [];
  let duplicate = 0;
  let invalid = 0;
  for (const line of lines) {
    const proxy = parseProxyUrl(line);
    if (!proxy) {
      invalid++;
      continue;
    }
    const key = `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`;
    if (seen.has(key)) {
      duplicate++;
      continue;
    }
    seen.add(key);
    proxies.push(proxy);
  }
  return {
    total: lines.length,
    valid: proxies.length,
    invalid,
    duplicate,
    proxies,
  };
}

export function proxyAddress(proxy: { host: string; port: number }) {
  return `${proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host}:${proxy.port}`;
}
