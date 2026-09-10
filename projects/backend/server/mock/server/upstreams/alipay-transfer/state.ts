import { MemoryRepository } from '@mock/core/memory-repository'
import type { AlipayTransferOrder, AlipayTransferRunPlan, AlipayTransferSettings } from './types'

export const DEFAULT_TRANSFER_NOTIFY_URL =
  process.env.MOCK_ALIPAY_TRANSFER_NOTIFY_URL ?? 'http://127.0.0.1:3100/v1/notify/alipay-transfer'
export const DEFAULT_TRANSFER_CALLBACK_SECRET =
  process.env.MOCK_ALIPAY_TRANSFER_CALLBACK_SECRET ?? 'mock-alipay-transfer-callback-secret'

const DEFAULT_SETTINGS: AlipayTransferSettings = {
  verifyRequestSign: true,
  availableAmount: '1000000.00',
  freezeAmount: '0.00',
  notifyUrl: DEFAULT_TRANSFER_NOTIFY_URL,
  callbackSecret: DEFAULT_TRANSFER_CALLBACK_SECRET,
}

export class AlipayTransferState {
  readonly orders = new MemoryRepository<AlipayTransferOrder>()
  readonly runs = new MemoryRepository<AlipayTransferRunPlan>()
  private settings = { ...DEFAULT_SETTINGS }

  getSettings() {
    return { ...this.settings }
  }

  updateSettings(patch: Partial<AlipayTransferSettings>) {
    this.settings = { ...this.settings, ...patch }
    return this.getSettings()
  }

  reset() {
    const deletedOrders = this.orders.clear()
    const deletedRuns = this.runs.clear()
    this.settings = { ...DEFAULT_SETTINGS }
    return { deletedOrders, deletedRuns, settings: this.getSettings() }
  }
}

const stateKey = Symbol.for('to-pay.mock.alipay-transfer.state')

export function getAlipayTransferState() {
  const globals = globalThis as typeof globalThis & { [stateKey]?: AlipayTransferState }
  globals[stateKey] ??= new AlipayTransferState()
  return globals[stateKey]
}
