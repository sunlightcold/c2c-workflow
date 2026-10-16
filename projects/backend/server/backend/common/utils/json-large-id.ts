import JSONbig from 'json-bigint'

const json = JSONbig({ storeAsString: true, protoAction: 'error', constructorAction: 'error' })
export function parseLargeIdJson(value: string): unknown {
  return json.parse(value)
}
