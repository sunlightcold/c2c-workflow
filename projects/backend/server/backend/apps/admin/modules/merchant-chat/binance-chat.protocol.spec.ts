import { normalizeChatMessage, parseChatJson, unwrapChatItems } from './binance-chat.protocol'

describe('Binance chat protocol', () => {
  it('preserves native large IDs and normalizes every wrapped array item', () => {
    const frame = parseChatJson(
      '{"data":[{"message":{"id":9223372036854775807,"orderNo":20476365073825144832,"type":"text","content":"hello","fromNickName":"Buyer"}},{"id":"2","orderNo":"order-2","chatMessageType":"image","imageUrl":"https://static-file-1306379396.file.myqcloud.com/client_upload/c2c/chat/20261016/a.png"}]}',
    )
    const messages = unwrapChatItems(frame).map((item) => normalizeChatMessage(item))
    expect(messages).toEqual([
      expect.objectContaining({
        sourceMessageId: '9223372036854775807',
        orderNo: '20476365073825144832',
        text: 'hello',
        buyerName: 'Buyer',
        origin: 'BUYER',
      }),
      expect.objectContaining({
        sourceMessageId: '2',
        type: 'IMAGE',
        imageUrl: expect.stringContaining('/client_upload/c2c/chat/'),
      }),
    ])
  })
  it('rejects unreliable identifiers instead of inventing them or rounding a Number', () => {
    expect(() => normalizeChatMessage({ orderNo: '1', type: 'text', content: 'hi' })).toThrow(
      '缺少可靠标识',
    )
    expect(() =>
      normalizeChatMessage({ id: Number.MAX_SAFE_INTEGER + 1, orderNo: '1', type: 'text' }),
    ).toThrow('缺少可靠标识')
    expect(
      normalizeChatMessage({ uuid: 'native-echo', orderNo: '1', type: 'text', self: true }),
    ).toMatchObject({ uuid: 'native-echo', origin: 'SELF' })
  })
  it('keeps platform automatic messages distinct and ignores control messages', () => {
    expect(
      normalizeChatMessage({ id: '1', orderNo: 'order', type: 'auto_reply', content: 'notice' }),
    ).toMatchObject({ origin: 'PLATFORM_AUTO' })
    expect(normalizeChatMessage({ type: 'statistics', totalCount: 1 })).toBeNull()
  })
})
