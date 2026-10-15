import { Injectable } from '@nestjs/common'
import { AdPricingRunner } from '../../../c2c-ad/ad-pricing-runner.service'
import { ScheduleTask } from '../task.decorator'

@ScheduleTask()
@Injectable()
export class C2cAdPricingJob {
  constructor(private readonly runner: AdPricingRunner) {}

  runDue() {
    return this.runner.runDue()
  }
}
