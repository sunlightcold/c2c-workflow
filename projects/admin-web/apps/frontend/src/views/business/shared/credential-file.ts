export type CredentialContentKind = 'certificate' | 'text';

const CERTIFICATE_ERROR =
  '未识别到有效的 X.509 证书，请选择 PEM 或 DER 编码的 .crt、.cer、.pem 或 .der 文件';

interface DerElement {
  contentStart: number;
  end: number;
  tag: number;
}

export async function readCredentialFile(
  file: File,
  contentKind: CredentialContentKind,
): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return contentKind === 'certificate'
    ? normalizeX509Certificate(bytes)
    : new TextDecoder().decode(bytes);
}

export function normalizeX509Certificate(bytes: Uint8Array): string {
  if (bytes.length === 0) throw new Error('证书文件为空，请重新选择');

  const text = decodeUtf8(bytes);
  if (text?.includes('-----BEGIN CERTIFICATE-----')) {
    return normalizePemCertificates(text);
  }

  assertX509Der(bytes);
  return toPem(bytes);
}

function normalizePemCertificates(source: string): string {
  const blocks: string[] = [];
  const pattern =
    /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  let consumed = 0;
  for (
    let match = pattern.exec(source);
    match !== null;
    match = pattern.exec(source)
  ) {
    if (source.slice(consumed, match.index).trim()) {
      throw new Error(CERTIFICATE_ERROR);
    }
    const encoded = match[1]?.replaceAll(/\s/g, '') ?? '';
    const certificate = decodePemBase64(encoded);
    assertX509Der(certificate);
    blocks.push(toPem(certificate));
    consumed = pattern.lastIndex;
  }

  if (blocks.length === 0 || source.slice(consumed).trim()) {
    throw new Error(CERTIFICATE_ERROR);
  }
  return blocks.join('\n');
}

function decodePemBase64(encoded: string): Uint8Array {
  if (!encoded || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) {
    throw new Error(CERTIFICATE_ERROR);
  }
  try {
    return Uint8Array.from(
      atob(encoded),
      (character) => character.codePointAt(0) ?? 0,
    );
  } catch {
    throw new Error(CERTIFICATE_ERROR);
  }
}

function assertX509Der(bytes: Uint8Array) {
  try {
    const certificate = readDerElement(bytes, 0);
    if (certificate.tag !== 0x30 || certificate.end !== bytes.length) {
      throw new Error('Invalid DER certificate envelope');
    }

    const body = readDerElement(bytes, certificate.contentStart);
    const algorithm = readDerElement(bytes, body.end);
    const signature = readDerElement(bytes, algorithm.end);
    if (
      body.tag !== 0x30 ||
      body.end === body.contentStart ||
      algorithm.tag !== 0x30 ||
      algorithm.end === algorithm.contentStart ||
      signature.tag !== 0x03 ||
      signature.end <= signature.contentStart + 1 ||
      signature.end !== certificate.end
    ) {
      throw new Error('Invalid X.509 certificate structure');
    }
  } catch {
    throw new Error(CERTIFICATE_ERROR);
  }
}

function readDerElement(bytes: Uint8Array, offset: number): DerElement {
  if (offset + 2 > bytes.length) throw new Error('Invalid DER element');
  const tag = bytes[offset] as number;
  const firstLengthByte = bytes[offset + 1] as number;
  let contentStart = offset + 2;
  let length = firstLengthByte;

  if ((firstLengthByte & 0x80) !== 0) {
    const lengthByteCount = firstLengthByte & 127;
    if (lengthByteCount === 0 || lengthByteCount > 4) {
      throw new Error('Invalid DER element length');
    }
    if (contentStart + lengthByteCount > bytes.length) {
      throw new Error('Incomplete DER element length');
    }
    length = 0;
    for (let index = 0; index < lengthByteCount; index += 1) {
      length = length * 256 + (bytes[contentStart + index] as number);
    }
    contentStart += lengthByteCount;
  }

  const end = contentStart + length;
  if (end > bytes.length) throw new Error('Incomplete DER element');
  return { contentStart, end, tag };
}

function decodeUtf8(bytes: Uint8Array): null | string {
  try {
    return new TextDecoder('utf8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function toPem(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCodePoint(...bytes.subarray(offset, offset + 32_768));
  }
  const lines =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}
