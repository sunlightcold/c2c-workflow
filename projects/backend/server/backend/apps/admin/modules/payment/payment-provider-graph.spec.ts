import { Test } from '@nestjs/testing'
import { C2C_SECRET_RESOLVER } from '../c2c-order/c2c-secret-resolver'
import {
  BinanceC2cClient,
  C2cPlatformCredentialFactory,
  OkxWebPrivateClient,
} from '../c2c-platform'
import { ALIPAY_ACCOUNT_GATEWAY_FACTORY } from './alipay-account-gateway.provider'
import { AlipayBatchPaymentExecutor } from './alipay-batch-payment.executor'
import { AlipayGatewayFactory } from './alipay-gateway.factory'
import { C2cAlipayPaymentExecutor } from './c2c-alipay-payment.executor'
import {
  C2cPaymentPreflightVerifier,
  PAYMENT_PREFLIGHT_STORE,
} from './c2c-payment-preflight-verifier'
import { C2cPlatformPaymentConfirmer } from './c2c-platform-payment.confirmer'
import {
  PAYMENT_EXECUTOR,
  PAYMENT_ORDER_STORE,
  PLATFORM_PAYMENT_CONFIRMER,
  PaymentExecutionCoordinator,
} from './payment-execution-coordinator'
import {
  PAYMENT_BATCH_EXECUTOR,
  PAYMENT_BATCH_PREFLIGHT,
  PAYMENT_BATCH_STORE,
  PaymentBatchExecutionCoordinator,
} from './payment-batch-execution-coordinator'

describe('Payment provider graph', () => {
  it('constructs the coordinator with the real executor and platform confirmer', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PaymentExecutionCoordinator,
        PaymentBatchExecutionCoordinator,
        AlipayBatchPaymentExecutor,
        C2cAlipayPaymentExecutor,
        C2cPlatformPaymentConfirmer,
        C2cPaymentPreflightVerifier,
        C2cPlatformCredentialFactory,
        AlipayGatewayFactory,
        { provide: PAYMENT_ORDER_STORE, useValue: {} },
        { provide: PAYMENT_EXECUTOR, useExisting: C2cAlipayPaymentExecutor },
        { provide: PAYMENT_BATCH_EXECUTOR, useExisting: AlipayBatchPaymentExecutor },
        { provide: PAYMENT_BATCH_STORE, useValue: {} },
        { provide: PAYMENT_BATCH_PREFLIGHT, useExisting: C2cPaymentPreflightVerifier },
        { provide: PLATFORM_PAYMENT_CONFIRMER, useExisting: C2cPlatformPaymentConfirmer },
        { provide: PAYMENT_PREFLIGHT_STORE, useValue: {} },
        { provide: C2C_SECRET_RESOLVER, useValue: {} },
        { provide: ALIPAY_ACCOUNT_GATEWAY_FACTORY, useValue: {} },
        { provide: BinanceC2cClient, useValue: {} },
        { provide: OkxWebPrivateClient, useValue: {} },
      ],
    }).compile()

    expect(module.get(PaymentExecutionCoordinator)).toBeInstanceOf(PaymentExecutionCoordinator)
    expect(module.get(PAYMENT_EXECUTOR)).toBeInstanceOf(C2cAlipayPaymentExecutor)
    expect(module.get(PLATFORM_PAYMENT_CONFIRMER)).toBeInstanceOf(C2cPlatformPaymentConfirmer)
    expect(module.get(PaymentBatchExecutionCoordinator)).toBeInstanceOf(
      PaymentBatchExecutionCoordinator,
    )
    expect(module.get(PAYMENT_BATCH_EXECUTOR)).toBeInstanceOf(AlipayBatchPaymentExecutor)
  })
})
