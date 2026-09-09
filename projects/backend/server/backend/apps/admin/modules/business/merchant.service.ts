import { BusinessStatus, MerchantEntity, MerchantPlatform } from '@admin/database'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

export interface CreateMerchantInput {
  code: string
  name: string
  platform: MerchantPlatform
  externalMerchantId?: string | null
}

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly repository: Repository<MerchantEntity>,
  ) {}

  list(tenantId: string) {
    return this.repository.find({ where: { tenantId }, order: { createdAt: 'DESC' } })
  }

  create(tenantId: string, input: CreateMerchantInput) {
    return this.repository.save(
      this.repository.create({
        tenantId,
        code: input.code,
        name: input.name,
        platform: input.platform,
        externalMerchantId: input.externalMerchantId ?? null,
        status: BusinessStatus.ACTIVE,
      }),
    )
  }

  async update(
    tenantId: string,
    id: string,
    input: { name?: string; externalMerchantId?: string | null },
  ) {
    if ('platform' in input) throw new BadRequestException('商家平台创建后不可修改')
    const merchant = await this.repository.findOne({ where: { id, tenantId } })
    if (!merchant) throw new NotFoundException('商家不存在')
    if (input.name !== undefined) merchant.name = input.name
    if (input.externalMerchantId !== undefined)
      merchant.externalMerchantId = input.externalMerchantId
    return this.repository.save(merchant)
  }
}
