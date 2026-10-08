import axios, { AxiosError } from 'axios'
import { Logger } from '@nestjs/common'
import { AxiosC2cHttpTransport } from './axios-c2c-http.transport'

describe('AxiosC2cHttpTransport appeal logging', () => {
  const transport = new AxiosC2cHttpTransport()
  const request = {
    method: 'POST' as const,
    url: 'https://api.binance.com/sapi/v1/c2c/complaint/submit-complaint?signature=private-signature',
    headers: { 'X-MBX-APIKEY': 'private-api-key' },
    timeoutMs: 5000,
    body: { orderNo: 'BIN-1', reasonCode: 1, description: '我已付款给卖家，卖家未放行' },
  }

  afterEach(() => jest.restoreAllMocks())

  it('records the request and original HTTP rejection response while preserving the Axios error', async () => {
    const response = {
      code: 'APPEAL_REJECTED',
      message: '尚未达到申诉等待时间',
      data: { seconds: 180 },
    }
    const error = new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST')
    Object.defineProperty(error, 'response', {
      value: { status: 400, data: response },
    })
    jest.spyOn(axios, 'request').mockRejectedValue(error)
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation()

    await expect(transport.request(request)).rejects.toBe(error)
    expect(error.message).toContain('尚未达到申诉等待时间')
    expect(error.message).toContain('APPEAL_REJECTED')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('BIN-1'))
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(response)))
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('httpStatus=400'))
    const logs = JSON.stringify([log.mock.calls, logError.mock.calls])
    expect(logs).toContain('/sapi/v1/c2c/complaint/submit-complaint')
    expect(logs).not.toContain('private-api-key')
    expect(logs).not.toContain('private-signature')
  })

  it('logs HTTP 200 business rejection responses without changing their return value', async () => {
    const response = {
      success: false,
      code: 'BUSINESS_ERROR',
      message: '申诉原因不支持',
      data: null,
    }
    jest.spyOn(axios, 'request').mockResolvedValue({ status: 200, data: response })
    jest.spyOn(Logger.prototype, 'log').mockImplementation()
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()

    await expect(transport.request(request)).resolves.toEqual(response)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(response)))
  })

  it('logs receipt upload metadata without recording the binary file or signed URL', async () => {
    jest.spyOn(axios, 'request').mockResolvedValue({ status: 200, data: '' })
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    await transport.request({
      ...request,
      method: 'PUT',
      url: 'https://upload.example.test/receipt.jpg?X-Amz-Signature=private-signature',
      body: Buffer.from('receipt-binary'),
    })
    const logs = JSON.stringify(log.mock.calls)
    expect(logs).toContain('bytes')
    expect(logs).not.toContain('receipt-binary')
    expect(logs).not.toContain('private-signature')
  })

  it('does not log successful order polling requests', async () => {
    jest.spyOn(axios, 'request').mockResolvedValue({ status: 200, data: { success: true } })
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    await transport.request({
      ...request,
      url: 'https://api.binance.com/sapi/v1/c2c/orderMatch/listOrders',
    })
    expect(log).not.toHaveBeenCalled()
  })

  it('retains the original network error description', async () => {
    const error = new AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED')
    jest.spyOn(axios, 'request').mockRejectedValue(error)
    jest.spyOn(Logger.prototype, 'log').mockImplementation()
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    await expect(transport.request(request)).rejects.toBe(error)
    expect(error.message).toContain('timeout of 5000ms exceeded')
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('timeout of 5000ms exceeded'))
  })

  it('excludes credentials from query parameters and nested payloads', async () => {
    jest.spyOn(axios, 'request').mockResolvedValue({ status: 200, data: { code: '0' } })
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    await transport.request({
      ...request,
      params: { token: 'private-query-token', orderNo: 'BIN-1' },
      body: { accessToken: 'private-access-token', privateKey: 'private-key-content' },
    })
    const logs = JSON.stringify(log.mock.calls)
    expect(logs).toContain('BIN-1')
    expect(logs).not.toContain('private-query-token')
    expect(logs).not.toContain('private-access-token')
    expect(logs).not.toContain('private-key-content')
  })
})
