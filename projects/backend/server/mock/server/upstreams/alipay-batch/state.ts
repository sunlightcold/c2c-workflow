import { MemoryRepository } from '@mock/core/memory-repository'
import type { AlipayBatchOrder, AlipayBatchRunPlan, AlipayBatchSettings, AlipayReceiptRecord } from './types'

export const DEFAULT_NOTIFY_URL = process.env.MOCK_ALIPAY_NOTIFY_URL ?? 'http://127.0.0.1:3100/v1/notify/alipay-batch'

const DEFAULT_SETTINGS: AlipayBatchSettings = {
  availableAmount: '1000000.00',
  freezeAmount: '0.00',
  verifyRequestSign: true,
  createBatchStatus: 'DEALING',
  createDetailStatus: 'DEALING',
  autoAdvanceAfterQueries: 1,
  autoAdvanceBatchStatus: 'SUCCESS',
  autoAdvanceDetailStatus: 'SUCCESS',
  randomDetailFailRate: 20,
  notifyUrl: DEFAULT_NOTIFY_URL,
  receiptReadyAfterQueries: 1,
  receiptFinalStatus: 'SUCCESS',
  receiptErrorMessage: '电子回单生成失败',
}

export class AlipayBatchState {
  readonly orders = new MemoryRepository<AlipayBatchOrder>()
  readonly receipts = new MemoryRepository<AlipayReceiptRecord>()
  readonly runs = new MemoryRepository<AlipayBatchRunPlan>()
  private settings: AlipayBatchSettings = { ...DEFAULT_SETTINGS }

  getSettings() {
    return { ...this.settings }
  }

  updateSettings(patch: Partial<AlipayBatchSettings>) {
    this.settings = { ...this.settings, ...patch }
    return this.getSettings()
  }

  reset() {
    const deletedOrders = this.orders.clear()
    const deletedReceipts = this.receipts.clear()
    const deletedRuns = this.runs.clear()
    this.settings = { ...DEFAULT_SETTINGS }
    return { deletedOrders, deletedReceipts, deletedRuns, settings: this.getSettings() }
  }
}

const stateKey = Symbol.for('to-pay.mock.alipay-batch.state')

export function getAlipayBatchState(): AlipayBatchState {
  const globals = globalThis as typeof globalThis & { [stateKey]?: AlipayBatchState }
  globals[stateKey] ??= new AlipayBatchState()
  return globals[stateKey]
}
