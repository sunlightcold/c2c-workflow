import {
  BusinessStatus,
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentAdapterCode,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchItemStatus,
  PaymentBatchStatus,
  PaymentBatchStatusHistoryEntity,
  PaymentChannelEntity,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentOrderStatusHistoryEntity,
  PaymentPlatformEntity,
  PaymentSourceType,
} from '@admin/database'
import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource, EntityManager, In, Not } from 'typeorm'
import type { AlipayBatchDetail, AlipayBatchResponse } from './alipay-batch.adapter'
import { normalizeCnyAmount, PaymentExecutionStatus } from './payment-adapter.types'
import type {
  ExecutablePaymentBatch,
  ExecutablePaymentBatchItem,
  PaymentBatchApplyOutcome,
  PaymentBatchStore,
} from './payment-batch-execution-coordinator'

@Injectable()
export class TypeOrmPaymentBatchStore implements PaymentBatchStore {
  constructor(private readonly dataSource: DataSource) {}

  async prepare(tenantId: string, batchId: string): Promise<ExecutablePaymentBatch> {
    const batch = await this.dataSource.getRepository(PaymentBatchEntity).findOne({
      where: { id: batchId, tenantId },
    })
    if (!batch) throw new ConflictException('支付批次不存在或不属于当前所属单位')
    if (
      ![
        PaymentBatchStatus.READY,
        PaymentBatchStatus.SUBMITTING,
        PaymentBatchStatus.PROCESSING,
        PaymentBatchStatus.UNKNOWN,
      ].includes(batch.status)
    ) {
      throw new ConflictException('支付批次当前状态不允许提交或回查')
    }
    const items = await this.dataSource.getRepository(PaymentBatchItemEntity).find({
      where: {
        batchId: batch.id,
        tenantId,
        merchantId: batch.merchantId,
        status: Not(PaymentBatchItemStatus.CANCELLED),
      },
      order: { id: 'ASC' },
    })
    const orders = await this.dataSource.getRepository(PaymentOrderEntity).find({
      where: {
        id: In(items.map(({ paymentOrderId }) => paymentOrderId)),
        tenantId,
        merchantId: batch.merchantId,
      },
    })
    const orderMap = new Map(orders.map((order) => [order.id, order]))
    if (items.length !== batch.totalCount || orders.length !== items.length)
      throw new ConflictException('支付批次明细数量不一致')
    if (
      items.some((item) => {
        const order = orderMap.get(item.paymentOrderId)
        return (
          !order ||
          order.paymentAccountId !== batch.paymentAccountId ||
          order.paymentAccountChannelId !== batch.paymentAccountChannelId ||
          order.currency !== batch.currency ||
          normalizeCnyAmount(order.amount) !== normalizeCnyAmount(item.amount)
        )
      })
    ) {
      throw new ConflictException('支付批次明细与支付订单不一致')
    }
    const totalAmount = items.reduce(
      (sum, item) => sum + BigInt(normalizeCnyAmount(item.amount).replace('.', '')),
      0n,
    )
    if (totalAmount !== BigInt(normalizeCnyAmount(batch.totalAmount).replace('.', '')))
      throw new ConflictException('支付批次总金额与明细不一致')
    const account = await this.loadPaymentConfiguration(this.dataSource.manager, batch, orders, {
      requireActive: batch.status === PaymentBatchStatus.READY,
      lock: false,
    })
    return {
      id: batch.id,
      tenantId: batch.tenantId,
      merchantId: batch.merchantId,
      batchNo: batch.batchNo,
      status: batch.status,
      credentialRef: account.credentialRef,
      upstreamId: batch.upstreamId,
      items: items.map((item) => this.toExecutableItem(item, orderMap.get(item.paymentOrderId)!)),
    }
  }

  claim(input: ExecutablePaymentBatch): Promise<ExecutablePaymentBatch> {
    return this.dataSource.transaction(async (manager) => {
      const batch = await this.lockBatch(manager, input, [PaymentBatchStatus.READY])
      const { items, orders } = await this.lockItemsAndOrders(manager, batch)
      const account = await this.loadPaymentConfiguration(manager, batch, orders, {
        requireActive: true,
        lock: true,
      })
      if (items.some(({ status }) => status !== PaymentBatchItemStatus.QUEUED))
        throw new ConflictException('支付批次明细状态已变化')
      if (orders.some(({ status }) => status !== PaymentOrderStatus.READY))
        throw new ConflictException('支付订单状态已变化')
      await this.transitionBatch(manager, batch, PaymentBatchStatus.SUBMITTING)
      for (const item of items) item.status = PaymentBatchItemStatus.SUBMITTING
      await manager.save(items)
      for (const order of orders) {
        const previous = order.status
        order.status = PaymentOrderStatus.SUBMITTING
        order.lastError = null
        await manager.save(order)
        await this.paymentHistory(manager, order, previous, order.status)
        await this.claimMerchantOrder(manager, order)
      }
      return {
        ...input,
        status: PaymentBatchStatus.SUBMITTING,
        credentialRef: account.credentialRef,
      }
    })
  }

  markSubmitted(
    input: ExecutablePaymentBatch,
    status: PaymentBatchStatus.PROCESSING,
    upstreamId?: string,
  ): Promise<ExecutablePaymentBatch> {
    return this.dataSource.transaction(async (manager) => {
      const batch = await this.lockBatch(manager, input, [PaymentBatchStatus.SUBMITTING])
      const { items, orders } = await this.lockItemsAndOrders(manager, batch)
      for (const item of items) {
        if (item.status === PaymentBatchItemStatus.SUBMITTING)
          item.status = PaymentBatchItemStatus.PROCESSING
      }
      await manager.save(items)
      Object.assign(batch, this.countItems(items), {
        upstreamId: upstreamId ?? batch.upstreamId,
      })
      await this.transitionBatch(manager, batch, status)
      for (const order of orders) {
        if (order.status !== PaymentOrderStatus.SUBMITTING) continue
        const previous = order.status
        order.status = PaymentOrderStatus.PROCESSING
        order.upstreamId = upstreamId ?? order.upstreamId
        await manager.save(order)
        await this.paymentHistory(manager, order, previous, order.status)
      }
      return { ...input, status, upstreamId: batch.upstreamId }
    })
  }

  markUnknown(
    input: ExecutablePaymentBatch,
    errorMessage?: string,
  ): Promise<ExecutablePaymentBatch> {
    return this.moveActiveBatch(
      input,
      PaymentBatchStatus.UNKNOWN,
      PaymentBatchItemStatus.UNKNOWN,
      PaymentOrderStatus.UNKNOWN,
      errorMessage,
    )
  }

  fail(input: ExecutablePaymentBatch, errorMessage?: string): Promise<ExecutablePaymentBatch> {
    return this.moveActiveBatch(
      input,
      PaymentBatchStatus.FAILED,
      PaymentBatchItemStatus.FAILED,
      PaymentOrderStatus.FAILED,
      errorMessage,
    )
  }

  applyQuery(
    input: ExecutablePaymentBatch,
    result: {
      status: PaymentExecutionStatus
      upstreamId?: string
      errorMessage?: string
      raw: AlipayBatchResponse
    },
  ): Promise<PaymentBatchApplyOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const batch = await this.lockBatch(manager, input, [
        PaymentBatchStatus.SUBMITTING,
        PaymentBatchStatus.PROCESSING,
        PaymentBatchStatus.UNKNOWN,
      ])
      const { items, orders } = await this.lockItemsAndOrders(manager, batch)
      if (result.raw.outBatchNo !== batch.batchNo)
        throw new ConflictException('支付宝批次业务单号不匹配')
      const itemByPaymentNo = new Map<string, PaymentBatchItemEntity>()
      const orderByItemId = new Map<string, PaymentOrderEntity>()
      const orderById = new Map(orders.map((order) => [order.id, order]))
      for (const item of items) {
        const order = orderById.get(item.paymentOrderId)!
        itemByPaymentNo.set(order.paymentNo, item)
        orderByItemId.set(item.id, order)
      }
      const details = result.raw.accDetailList ?? []
      const seen = new Set<string>()
      for (const detail of details) {
        const item = itemByPaymentNo.get(detail.outBizNo)
        if (!item) throw new ConflictException('支付宝批次包含未知支付明细')
        if (seen.has(detail.outBizNo)) throw new ConflictException('支付宝批次返回重复支付明细')
        seen.add(detail.outBizNo)
        if (normalizeCnyAmount(detail.transAmount) !== normalizeCnyAmount(item.amount))
          throw new ConflictException('支付宝批次明细金额不匹配')
      }
      if (result.status === PaymentExecutionStatus.SUCCESS && seen.size !== items.length)
        throw new ConflictException('支付宝成功批次缺少支付明细')

      const paymentsToConfirm: PaymentBatchApplyOutcome['paymentsToConfirm'] = []
      for (const item of items) {
        const order = orderByItemId.get(item.id)!
        const detail = details.find(({ outBizNo }) => outBizNo === order.paymentNo)
        if (detail) {
          await this.applyDetail(manager, item, order, detail, paymentsToConfirm)
        } else if (result.status === PaymentExecutionStatus.FAILED) {
          await this.failItem(manager, item, order, result.errorMessage ?? result.raw.subMsg)
        } else {
          await this.processItem(manager, item, order)
        }
      }
      const counts = this.countItems(items)
      Object.assign(batch, counts, {
        upstreamId: result.upstreamId ?? result.raw.batchTransId ?? batch.upstreamId,
        lastError: result.errorMessage ?? null,
      })
      const next = this.aggregateStatus(items)
      await this.transitionBatch(manager, batch, next, result.errorMessage)
      return { batch: { ...input, status: next, upstreamId: batch.upstreamId }, paymentsToConfirm }
    })
  }

  private async moveActiveBatch(
    input: ExecutablePaymentBatch,
    batchStatus: PaymentBatchStatus,
    itemStatus: PaymentBatchItemStatus,
    orderStatus: PaymentOrderStatus,
    errorMessage?: string,
  ): Promise<ExecutablePaymentBatch> {
    return this.dataSource.transaction(async (manager) => {
      const batch = await this.lockBatch(manager, input, [
        PaymentBatchStatus.SUBMITTING,
        PaymentBatchStatus.PROCESSING,
        PaymentBatchStatus.UNKNOWN,
      ])
      const { items, orders } = await this.lockItemsAndOrders(manager, batch)
      for (const item of items) {
        if (this.isFinalItem(item.status)) continue
        item.status = itemStatus
        item.errorMessage = errorMessage ?? null
      }
      await manager.save(items)
      Object.assign(batch, this.countItems(items), { lastError: errorMessage ?? null })
      await this.transitionBatch(manager, batch, batchStatus, errorMessage)
      for (const order of orders) {
        if (!this.isActivePayment(order.status)) continue
        const previous = order.status
        order.status = orderStatus
        order.lastError = errorMessage ?? null
        await manager.save(order)
        await this.paymentHistory(manager, order, previous, order.status, errorMessage)
        if (orderStatus === PaymentOrderStatus.FAILED)
          await this.restoreMerchantOrder(manager, order, errorMessage)
      }
      return { ...input, status: batchStatus }
    })
  }

  private async applyDetail(
    manager: EntityManager,
    item: PaymentBatchItemEntity,
    order: PaymentOrderEntity,
    detail: AlipayBatchDetail,
    paymentsToConfirm: PaymentBatchApplyOutcome['paymentsToConfirm'],
  ): Promise<void> {
    if (detail.status === 'SUCCESS') {
      item.status = PaymentBatchItemStatus.SUCCESS
      item.upstreamId = detail.alipayOrderNo ?? detail.detailId
      item.errorCode = null
      item.errorMessage = null
      if (this.isActivePayment(order.status)) {
        const previous = order.status
        order.status = PaymentOrderStatus.SUCCESS
        order.upstreamId = detail.alipayOrderNo ?? detail.detailId
        order.lastError = null
        await manager.save(order)
        await this.paymentHistory(manager, order, previous, order.status)
        if (order.sourceType === PaymentSourceType.BOT_MANUAL) {
          const paid = order.status
          order.status = PaymentOrderStatus.COMPLETED
          await manager.save(order)
          await this.paymentHistory(manager, order, paid, order.status)
        }
      }
      if (
        order.sourceType === PaymentSourceType.C2C_BUY &&
        [PaymentOrderStatus.SUCCESS, PaymentOrderStatus.PLATFORM_CONFIRM_PENDING].includes(
          order.status,
        )
      ) {
        paymentsToConfirm.push({
          id: order.id,
          tenantId: order.tenantId,
          status: order.status,
          upstreamId: order.upstreamId,
        })
      }
    } else if (detail.status === 'FAIL') {
      await this.failItem(manager, item, order, detail.errorMsg ?? detail.errorCode)
      item.errorCode = detail.errorCode ?? null
    } else {
      await this.processItem(manager, item, order)
    }
    await manager.save(item)
  }

  private async failItem(
    manager: EntityManager,
    item: PaymentBatchItemEntity,
    order: PaymentOrderEntity,
    reason?: string,
  ): Promise<void> {
    item.status = PaymentBatchItemStatus.FAILED
    item.errorMessage = reason ?? null
    if (!this.isActivePayment(order.status)) return
    const previous = order.status
    order.status = PaymentOrderStatus.FAILED
    order.lastError = reason ?? null
    await manager.save(order)
    await this.paymentHistory(manager, order, previous, order.status, reason)
    await this.restoreMerchantOrder(manager, order, reason)
  }

  private async processItem(
    manager: EntityManager,
    item: PaymentBatchItemEntity,
    order: PaymentOrderEntity,
  ): Promise<void> {
    if (!this.isFinalItem(item.status)) item.status = PaymentBatchItemStatus.PROCESSING
    if (!this.isActivePayment(order.status) || order.status === PaymentOrderStatus.PROCESSING)
      return
    const previous = order.status
    order.status = PaymentOrderStatus.PROCESSING
    order.lastError = null
    await manager.save(order)
    await this.paymentHistory(manager, order, previous, order.status)
  }

  private async lockBatch(
    manager: EntityManager,
    input: ExecutablePaymentBatch,
    statuses: PaymentBatchStatus[],
  ) {
    const batch = await manager.getRepository(PaymentBatchEntity).findOne({
      where: { id: input.id, tenantId: input.tenantId, status: In(statuses) },
      lock: { mode: 'pessimistic_write' },
    })
    if (!batch) throw new ConflictException('支付批次状态已变化，请刷新后重试')
    return batch
  }

  private async lockItemsAndOrders(manager: EntityManager, batch: PaymentBatchEntity) {
    const items = await manager.getRepository(PaymentBatchItemEntity).find({
      where: {
        batchId: batch.id,
        tenantId: batch.tenantId,
        merchantId: batch.merchantId,
        status: Not(PaymentBatchItemStatus.CANCELLED),
      },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    })
    const orders = await manager.getRepository(PaymentOrderEntity).find({
      where: {
        id: In(items.map(({ paymentOrderId }) => paymentOrderId)),
        tenantId: batch.tenantId,
        merchantId: batch.merchantId,
      },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    })
    if (items.length !== batch.totalCount || orders.length !== items.length)
      throw new ConflictException('支付批次明细数量不一致')
    return { items, orders }
  }

  private async loadPaymentConfiguration(
    manager: EntityManager,
    batch: PaymentBatchEntity,
    orders: PaymentOrderEntity[],
    options: { requireActive: boolean; lock: boolean },
  ): Promise<PaymentAccountEntity> {
    const accountQuery = manager
      .getRepository(PaymentAccountEntity)
      .createQueryBuilder('account')
      .addSelect('account.credentialRef')
      .where('account.id = :accountId', { accountId: batch.paymentAccountId })
      .andWhere('account."tenantId" = :tenantId', { tenantId: batch.tenantId })
    if (options.requireActive)
      accountQuery.andWhere('account.status = :accountStatus', {
        accountStatus: BusinessStatus.ACTIVE,
      })
    if (options.lock) accountQuery.setLock('pessimistic_write')
    const account = await accountQuery.getOne()

    const accountChannelQuery = manager
      .getRepository(PaymentAccountChannelEntity)
      .createQueryBuilder('account_channel')
      .where('account_channel.id = :accountChannelId', {
        accountChannelId: batch.paymentAccountChannelId,
      })
      .andWhere('account_channel."paymentAccountId" = :accountId', {
        accountId: batch.paymentAccountId,
      })
    if (options.requireActive)
      accountChannelQuery.andWhere('account_channel.status = :accountChannelStatus', {
        accountChannelStatus: BusinessStatus.ACTIVE,
      })
    if (options.lock) accountChannelQuery.setLock('pessimistic_write')
    const accountChannel = await accountChannelQuery.getOne()
    if (!account || !accountChannel) {
      throw new ConflictException('支付批次锁定的支付账号配置已失效')
    }

    const channelQuery = manager
      .getRepository(PaymentChannelEntity)
      .createQueryBuilder('channel')
      .where('channel.id = :channelId', { channelId: accountChannel.channelId })
    if (options.requireActive)
      channelQuery.andWhere('channel.status = :channelStatus', {
        channelStatus: BusinessStatus.ACTIVE,
      })
    if (options.lock) channelQuery.setLock('pessimistic_write')
    const channel = await channelQuery.getOne()

    const platformQuery = manager
      .getRepository(PaymentPlatformEntity)
      .createQueryBuilder('platform')
      .where('platform.id = :platformId', { platformId: account.platformId })
    if (options.requireActive)
      platformQuery.andWhere('platform.status = :platformStatus', {
        platformStatus: BusinessStatus.ACTIVE,
      })
    if (options.lock) platformQuery.setLock('pessimistic_write')
    const platform = await platformQuery.getOne()
    if (!this.isAlipayBatchConfiguration(account, channel, platform)) {
      throw new ConflictException('支付批次锁定的支付宝批量有密通道已失效')
    }

    const planIds = [
      ...new Set(orders.map(({ paymentPlanId }) => paymentPlanId).filter(Boolean)),
    ] as string[]
    const planQuery = manager
      .getRepository(MerchantPaymentPlanEntity)
      .createQueryBuilder('plan')
      .where('plan.id IN (:...planIds)', { planIds })
      .andWhere('plan."tenantId" = :tenantId', { tenantId: batch.tenantId })
      .andWhere('plan."merchantId" = :merchantId', { merchantId: batch.merchantId })
    if (options.requireActive)
      planQuery.andWhere('plan.status = :planStatus', { planStatus: BusinessStatus.ACTIVE })
    if (options.lock) planQuery.setLock('pessimistic_write')
    const plans = planIds.length ? await planQuery.getMany() : []
    if (!this.paymentPlansMatchBatch(batch, orders, planIds, plans)) {
      throw new ConflictException('支付批次锁定的支付方案已失效')
    }
    return account
  }

  private isAlipayBatchConfiguration(
    account: PaymentAccountEntity,
    channel: PaymentChannelEntity | null,
    platform: PaymentPlatformEntity | null,
  ): boolean {
    return Boolean(
      channel &&
        platform &&
        channel.platformId === account.platformId &&
        channel.adapterCode === PaymentAdapterCode.ALIPAY_BATCH &&
        channel.executionMode === PaymentExecutionMode.BATCH &&
        platform.code === 'ALIPAY',
    )
  }

  private paymentPlansMatchBatch(
    batch: PaymentBatchEntity,
    orders: PaymentOrderEntity[],
    planIds: string[],
    plans: MerchantPaymentPlanEntity[],
  ): boolean {
    if (plans.length !== planIds.length) return false
    const planById = new Map(plans.map((plan) => [plan.id, plan]))
    return orders.every((order) => {
      const plan = order.paymentPlanId ? planById.get(order.paymentPlanId) : undefined
      return Boolean(
        plan &&
          plan.paymentAccountId === batch.paymentAccountId &&
          plan.paymentAccountChannelId === batch.paymentAccountChannelId,
      )
    })
  }

  private async transitionBatch(
    manager: EntityManager,
    batch: PaymentBatchEntity,
    next: PaymentBatchStatus,
    reason?: string,
  ): Promise<void> {
    const previous = batch.status
    batch.status = next
    await manager.save(batch)
    if (previous === next && !reason) return
    await manager.insert(PaymentBatchStatusHistoryEntity, {
      tenantId: batch.tenantId,
      merchantId: batch.merchantId,
      batchId: batch.id,
      fromStatus: previous,
      toStatus: next,
      source: 'PAYMENT_BATCH_COORDINATOR',
      reason: reason ?? null,
    })
  }

  private paymentHistory(
    manager: EntityManager,
    order: PaymentOrderEntity,
    fromStatus: PaymentOrderStatus,
    toStatus: PaymentOrderStatus,
    reason?: string,
  ) {
    return manager.insert(PaymentOrderStatusHistoryEntity, {
      tenantId: order.tenantId,
      merchantId: order.merchantId,
      paymentOrderId: order.id,
      fromStatus,
      toStatus,
      source: 'PAYMENT_BATCH_COORDINATOR',
      reason: reason ?? null,
    })
  }

  private async claimMerchantOrder(
    manager: EntityManager,
    order: PaymentOrderEntity,
  ): Promise<void> {
    if (order.sourceType !== PaymentSourceType.C2C_BUY) return
    const merchantOrder = await manager.getRepository(MerchantOrderEntity).findOne({
      where: {
        tenantId: order.tenantId,
        merchantId: order.merchantId,
        platformOrderId: order.sourceBusinessNo,
      },
      lock: { mode: 'pessimistic_write' },
    })
    if (!merchantOrder || merchantOrder.status !== MerchantOrderStatus.PENDING_PAYMENT)
      throw new ConflictException('商家订单已不可进入批量支付处理')
    const previous = merchantOrder.status
    merchantOrder.status = MerchantOrderStatus.PAYMENT_PROCESSING
    await manager.save(merchantOrder)
    await this.merchantHistory(manager, merchantOrder, previous, merchantOrder.status)
  }

  private async restoreMerchantOrder(
    manager: EntityManager,
    order: PaymentOrderEntity,
    reason?: string,
  ): Promise<void> {
    if (order.sourceType !== PaymentSourceType.C2C_BUY) return
    const merchantOrder = await manager.getRepository(MerchantOrderEntity).findOne({
      where: {
        tenantId: order.tenantId,
        merchantId: order.merchantId,
        platformOrderId: order.sourceBusinessNo,
      },
      lock: { mode: 'pessimistic_write' },
    })
    if (!merchantOrder || merchantOrder.status !== MerchantOrderStatus.PAYMENT_PROCESSING) return
    const previous = merchantOrder.status
    merchantOrder.status = MerchantOrderStatus.PENDING_PAYMENT
    merchantOrder.lastError = reason ?? null
    await manager.save(merchantOrder)
    await this.merchantHistory(manager, merchantOrder, previous, merchantOrder.status, reason)
  }

  private merchantHistory(
    manager: EntityManager,
    order: MerchantOrderEntity,
    fromStatus: MerchantOrderStatus,
    toStatus: MerchantOrderStatus,
    reason?: string,
  ) {
    return manager.insert(MerchantOrderStatusHistoryEntity, {
      tenantId: order.tenantId,
      merchantId: order.merchantId,
      merchantOrderId: order.id,
      fromStatus,
      toStatus,
      source: 'PAYMENT_BATCH_COORDINATOR',
      platformStatus: order.platformStatus,
      reason: reason ?? null,
    })
  }

  private toExecutableItem(
    item: PaymentBatchItemEntity,
    order: PaymentOrderEntity,
  ): ExecutablePaymentBatchItem {
    return {
      id: item.id,
      paymentOrderId: order.id,
      paymentNo: order.paymentNo,
      sourceType: order.sourceType,
      amount: item.amount,
      payeeIdentity: order.payeeIdentity,
      payeeName: order.payeeName,
    }
  }

  private countItems(items: PaymentBatchItemEntity[]) {
    return {
      successCount: items.filter(({ status }) => status === PaymentBatchItemStatus.SUCCESS).length,
      failedCount: items.filter(({ status }) => status === PaymentBatchItemStatus.FAILED).length,
      processingCount: items.filter(({ status }) => status === PaymentBatchItemStatus.PROCESSING)
        .length,
      unknownCount: items.filter(({ status }) => status === PaymentBatchItemStatus.UNKNOWN).length,
    }
  }

  private aggregateStatus(items: PaymentBatchItemEntity[]): PaymentBatchStatus {
    if (items.some(({ status }) => status === PaymentBatchItemStatus.UNKNOWN))
      return PaymentBatchStatus.UNKNOWN
    if (
      items.some(({ status }) =>
        [
          PaymentBatchItemStatus.QUEUED,
          PaymentBatchItemStatus.SUBMITTING,
          PaymentBatchItemStatus.PROCESSING,
        ].includes(status),
      )
    )
      return PaymentBatchStatus.PROCESSING
    const successes = items.filter(({ status }) => status === PaymentBatchItemStatus.SUCCESS).length
    if (successes === items.length) return PaymentBatchStatus.SUCCESS
    if (successes > 0) return PaymentBatchStatus.PARTIAL_SUCCESS
    return PaymentBatchStatus.FAILED
  }

  private isFinalItem(status: PaymentBatchItemStatus): boolean {
    return [
      PaymentBatchItemStatus.SUCCESS,
      PaymentBatchItemStatus.FAILED,
      PaymentBatchItemStatus.CANCELLED,
    ].includes(status)
  }

  private isActivePayment(status: PaymentOrderStatus): boolean {
    return [
      PaymentOrderStatus.SUBMITTING,
      PaymentOrderStatus.PROCESSING,
      PaymentOrderStatus.UNKNOWN,
    ].includes(status)
  }
}
