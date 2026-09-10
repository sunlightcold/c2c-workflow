import { MemoryRepository } from '@mock/core/memory-repository'
import type { BinanceC2cMockOrder, BinanceC2cSettings } from './types'

const DEFAULT_SETTINGS: BinanceC2cSettings = {
  verifySignature: true,
  markOrderAsPaidFailure: false,
  apiKey: process.env.MOCK_BINANCE_API_KEY ?? 'mock-binance-api-key',
  secretKey: process.env.MOCK_BINANCE_SECRET_KEY ?? 'mock-binance-secret-key',
  clientType: process.env.MOCK_BINANCE_CLIENT_TYPE ?? 'WEB',
}

export class BinanceC2cState {
  readonly orders = new MemoryRepository<BinanceC2cMockOrder>()
  private settings = { ...DEFAULT_SETTINGS }
  private complaintSequence = 30_000_000

  getSettings() {
    return { ...this.settings }
  }

  updateSettings(patch: Partial<BinanceC2cSettings>) {
    this.settings = { ...this.settings, ...patch }
    return this.getSettings()
  }

  nextComplaintNo() {
    this.complaintSequence += 1
    return this.complaintSequence
  }

  reset() {
    const deletedOrders = this.orders.clear()
    this.settings = { ...DEFAULT_SETTINGS }
    this.complaintSequence = 30_000_000
    return { deletedOrders, settings: this.getSettings() }
  }
}

const stateKey = Symbol.for('to-pay.mock.binance-c2c.state')

export function getBinanceC2cState() {
  const globals = globalThis as typeof globalThis & { [stateKey]?: BinanceC2cState }
  globals[stateKey] ??= new BinanceC2cState()
  return globals[stateKey]
}
