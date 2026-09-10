import { MerchantOrderAppealStatus, MerchantOrderEntity } from '@admin/database'
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { C2cOrderAppealClaimResult, C2cOrderAppealStore } from './c2c-order-appeal.service'

@Injectable()
export class TypeOrmC2cOrderAppealStore implements C2cOrderAppealStore {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: Pick<DataSource, 'getRepository'>,
  ) {}

  async claim(
    tenantId: string,
    merchantId: string,
    orderId: string,
  ): Promise<C2cOrderAppealClaimResult> {
    const repository = this.dataSource.getRepository(MerchantOrderEntity)
    const result = await repository
      .createQueryBuilder()
      .update(MerchantOrderEntity)
      .set({
        appealStatus: MerchantOrderAppealStatus.PROCESSING,
        appealClaimedAt: new Date(),
        appealReasonCode: null,
        appealReason: null,
        appealComplaintNo: null,
        appealSubmittedAt: null,
        appealLastError: null,
      })
      .where('id = :orderId', { orderId })
      .andWhere('"tenantId" = :tenantId', { tenantId })
      .andWhere('"merchantId" = :merchantId', { merchantId })
      .andWhere('"appealStatus" IS NULL')
      .execute()
    if (result.affected === 1) return 'CLAIMED'

    const order = await repository.findOne({
      where: { id: orderId, tenantId, merchantId },
      select: { appealStatus: true },
    })
    if (!order) throw new NotFoundException('商家订单不存在')
    return order.appealStatus === MerchantOrderAppealStatus.SUBMITTED ? 'SUBMITTED' : 'PROCESSING'
  }

  async setReason(
    tenantId: string,
    merchantId: string,
    orderId: string,
    reasonCode: number,
    reason: string,
  ): Promise<void> {
    await this.updateProcessing(tenantId, merchantId, orderId, {
      appealReasonCode: reasonCode,
      appealReason: reason,
      appealLastError: null,
    })
  }

  async markSubmitted(
    tenantId: string,
    merchantId: string,
    orderId: string,
    complaintNo: string,
  ): Promise<void> {
    await this.updateProcessing(tenantId, merchantId, orderId, {
      appealStatus: MerchantOrderAppealStatus.SUBMITTED,
      appealComplaintNo: complaintNo,
      appealSubmittedAt: new Date(),
      appealLastError: null,
    })
  }

  async releaseClaim(
    tenantId: string,
    merchantId: string,
    orderId: string,
    error: string,
  ): Promise<void> {
    await this.updateProcessing(tenantId, merchantId, orderId, {
      appealStatus: null,
      appealClaimedAt: null,
      appealLastError: error,
    })
  }

  async markSubmissionUncertain(
    tenantId: string,
    merchantId: string,
    orderId: string,
    error: string,
  ): Promise<void> {
    await this.updateProcessing(tenantId, merchantId, orderId, {
      appealLastError: error,
    })
  }

  private async updateProcessing(
    tenantId: string,
    merchantId: string,
    orderId: string,
    values: Partial<MerchantOrderEntity>,
  ): Promise<void> {
    const result = await this.dataSource
      .getRepository(MerchantOrderEntity)
      .createQueryBuilder()
      .update(MerchantOrderEntity)
      .set(values)
      .where('id = :orderId', { orderId })
      .andWhere('"tenantId" = :tenantId', { tenantId })
      .andWhere('"merchantId" = :merchantId', { merchantId })
      .andWhere('"appealStatus" = :status', {
        status: MerchantOrderAppealStatus.PROCESSING,
      })
      .execute()
    if (result.affected !== 1) throw new ConflictException('商家订单申诉处理状态已变化')
  }
}
