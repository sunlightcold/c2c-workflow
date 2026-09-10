import { MerchantOrderEntity, MerchantOrderStatusHistoryEntity } from '@admin/database'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { MerchantOrderListDto } from './c2c-order.dto'

@Injectable()
export class C2cOrderService {
  constructor(
    @InjectRepository(MerchantOrderEntity)
    private readonly orderRepository: Repository<MerchantOrderEntity>,
    @InjectRepository(MerchantOrderStatusHistoryEntity)
    private readonly historyRepository: Repository<MerchantOrderStatusHistoryEntity>,
  ) {}

  async list(tenantId: string, input: MerchantOrderListDto) {
    const [items, total] = await this.orderRepository.findAndCount({
      where: {
        tenantId,
        merchantId: input.merchantId,
        ...(input.status ? { status: input.status } : {}),
      },
      order: { platformCreatedAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  async detail(tenantId: string, merchantId: string, id: string) {
    const order = await this.orderRepository.findOne({ where: { id, tenantId, merchantId } })
    if (!order) throw new NotFoundException('商家订单不存在')
    const history = await this.historyRepository.find({
      where: { tenantId, merchantId, merchantOrderId: id },
      order: { createdAt: 'ASC' },
    })
    return { ...order, history }
  }
}
