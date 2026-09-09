import type { Recordable } from '@vben/types';

export function safeParseJson(json: any, errorVal?: Recordable<any>) {
  if (typeof json !== 'string') {
    return errorVal ?? json;
  }
  try {
    return JSON.parse(json);
  } catch {
    return errorVal ?? json;
  }
}
