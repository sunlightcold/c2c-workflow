/// <reference types="jest" />

import axios from 'axios'
import { AxiosAiHttpTransport } from './ai-transport'

describe('AxiosAiHttpTransport', () => {
  afterEach(() => jest.restoreAllMocks())

  it('preserves the safe upstream failure reason without logging arbitrary response fields', async () => {
    jest.spyOn(axios, 'post').mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Reference image dimensions are invalid; api_key=private-google-key',
            type: 'invalid_request_error',
          },
          imageBase64: 'private-image-content',
        },
        status: 400,
      },
    })
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true)

    const error = await new AxiosAiHttpTransport()
      .post({
        body: {},
        headers: {
          Authorization: 'Bearer private-api-key',
          'x-goog-api-key': 'private-google-key',
        },
        timeoutMs: 1_000,
        url: 'https://provider.example.com/images',
      })
      .catch((reason: unknown) => reason)

    expect(error).toMatchObject({
      message:
        'AI upstream request failed with status 400: Reference image dimensions are invalid; api_key=[redacted] (code=INVALID_ARGUMENT, type=invalid_request_error)',
      retryable: false,
      status: 400,
    })
    expect(JSON.stringify(error)).not.toMatch(
      /private-image-content|private-api-key|private-google-key/,
    )
  })

  it('preserves the network failure reason when the upstream has no response', async () => {
    jest.spyOn(axios, 'post').mockRejectedValue({
      code: 'ECONNABORTED',
      isAxiosError: true,
      message: 'timeout of 60000ms exceeded',
    })
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true)

    await expect(
      new AxiosAiHttpTransport().post({
        body: {},
        headers: {},
        timeoutMs: 60_000,
        url: 'https://provider.example.com/images',
      }),
    ).rejects.toMatchObject({
      message: 'AI upstream request failed: timeout of 60000ms exceeded (code=ECONNABORTED)',
      retryable: true,
    })
  })
})
