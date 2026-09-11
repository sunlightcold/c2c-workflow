import { describe, expect, it } from 'vitest';

import { normalizeX509Certificate } from './credential-file';

const DER_CERTIFICATE_BASE64 =
  'MIICpjCCAY6gAwIBAgIIYS/LU+lKiPIwDQYJKoZIhvcNAQELBQAwEzERMA8GA1UEAxMIQzJDIFRlc3QwHhcNMjYwOTEwMTUxMDE3WhcNMjYxMDExMTUxMDE3WjATMREwDwYDVQQDEwhDMkMgVGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALSYcJYpT8NswmXaTGyDyCFYu3TNfU10IbhGDmXNdUqQBcZ0jUJmlkLPt9O/GyPlUeitaldHDr6DnxhZhCj9wfRcoFX8Dar0j34JdREuU9bPI/MgNbarwMnmmkRGo5XwV0RZFvbUs8371CIrUCYLN5niATpBAofFXE1nDW+JlPOdJrKlwMQEy96Vkqhxq0R5IxT+qDHicfJj6m2l0PKf7203u3ON48okw8gbCh8p7zzpSfoxeWcYU5QpH8TcDgwysEt9nHfCzu15mKo+cgcHxPUnTbMijYgCxd32NI9ACM8QjQYzTkB7wlFz75BVUuHAD3XJuyd97HXIu3rYBsraCs0CAwEAATANBgkqhkiG9w0BAQsFAAOCAQEARIDbpyiicVGkrrfDJLi+2/prxK0EYdfk5jTabkQNeVhYSeeKMzeqR9eAK2giDaixtwIyVRPBvi4jIiDqOGPDNT6lfl1q4WyPUjSD5a+zguJA9MqLys2afDg7u5rS955gzJTrZeaIg6wb4zYL+ziSneIpioxFBDlx3jfCFichrlrqaRFEYCGF7UMzJEK6Ww3lii4krymWBd/Cmy5hBizlbBty9VR3cih0W9i0PIbeMIxqSp+4LU7GmZopqbpejd3zk+0Ssz0XPK4T80xmAOcqcebhJYDaXeKnu9GhHUOQdlZq/aWWvKhtvg+Ik6s847/qWyCuibOwswW5xfH5qqbazQ==';

function decodeBase64(value: string) {
  return Uint8Array.from(
    atob(value),
    (character) => character.codePointAt(0) ?? 0,
  );
}

function pemCertificate(base64 = DER_CERTIFICATE_BASE64) {
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}

describe('x.509 credential file normalization', () => {
  it('keeps a PEM encoded .crt certificate in canonical PEM form', () => {
    const source = `\uFEFF  ${pemCertificate().replaceAll('\n', '\r\n')}  \r\n`;

    expect(normalizeX509Certificate(new TextEncoder().encode(source))).toBe(
      pemCertificate(),
    );
  });

  it('converts a DER encoded .crt certificate to PEM', () => {
    expect(normalizeX509Certificate(decodeBase64(DER_CERTIFICATE_BASE64))).toBe(
      pemCertificate(),
    );
  });

  it('preserves every certificate in a PEM root certificate chain', () => {
    const certificate = pemCertificate();

    expect(
      normalizeX509Certificate(
        new TextEncoder().encode(`${certificate}\n\n${certificate}`),
      ),
    ).toBe(`${certificate}\n${certificate}`);
  });

  it('rejects empty and malformed certificate files', () => {
    expect(() => normalizeX509Certificate(new Uint8Array())).toThrow(
      '证书文件为空',
    );
    expect(() =>
      normalizeX509Certificate(new TextEncoder().encode('not-a-certificate')),
    ).toThrow('未识别到有效的 X.509 证书');
  });
});
