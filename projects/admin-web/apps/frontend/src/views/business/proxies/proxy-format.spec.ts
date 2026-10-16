import { describe, expect, it } from 'vitest';

import { parseProxyBatch, parseProxyUrl } from './proxy-format';

describe('sub2api proxy URL compatibility', () => {
  it('accepts the four original schemes, IPv6 and literal credentials', () => {
    expect(parseProxyUrl(' SOCKS5H://user:p%40ss@[2001:db8::1]:1080 ')).toEqual(
      {
        protocol: 'socks5h',
        host: '2001:db8::1',
        port: 1080,
        username: 'user',
        password: 'p%40ss',
      },
    );
    for (const protocol of ['http', 'https', 'socks5', 'socks5h'])
      expect(parseProxyUrl(`${protocol}://example.com:65535`)).not.toBeNull();
  });
  it('keeps valid rows, ignores blank lines and deduplicates without protocol', () => {
    const result = parseProxyBatch(
      'http://u:p@host:80\n\nhttps://u:p@ host :80\ninvalid\nsocks5://host:1080\nhttp://host:0\n',
    );
    expect(result).toMatchObject({
      total: 5,
      valid: 2,
      invalid: 2,
      duplicate: 1,
    });
  });
  it('rejects URL paths, unbracketed IPv6 and invalid ports', () => {
    for (const url of [
      'http://host:80/path',
      'socks5://::1:1080',
      'http://host:65536',
      'ftp://host:21',
    ])
      expect(parseProxyUrl(url)).toBeNull();
  });
});
