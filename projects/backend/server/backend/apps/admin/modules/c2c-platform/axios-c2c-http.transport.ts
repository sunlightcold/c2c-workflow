import axios from 'axios'
import { Injectable } from '@nestjs/common'
import type { C2cHttpRequest, C2cHttpTransport } from './c2c-platform.types'

@Injectable()
export class AxiosC2cHttpTransport implements C2cHttpTransport {
  async request<T>(request: C2cHttpRequest): Promise<T> {
    const response = await axios.request<T>({
      method: request.method,
      url: request.url,
      headers: request.headers,
      timeout: request.timeoutMs,
      data: request.body,
      params: request.params,
    })
    return response.data
  }
}
