# Backend Testing Architecture

This project uses `Jest` and follows a three-layer testing architecture to match delivery risk:

1. Unit: fast, deterministic, isolated business logic checks.
2. Integration: module/service collaboration with real Nest container + mocked boundaries.
3. E2E: HTTP/API contract verification using app bootstrap + supertest.

## Directory Layout

```text
server/backend
├─ apps/
│  └─ ... source code
├─ common/
│  └─ ... shared code
└─ test/
   ├─ jest.base.config.js
   ├─ jest.unit.config.js
   ├─ jest.integration.config.js
   ├─ jest.e2e.config.js
   ├─ integration/
   │  └─ *.spec.ts
   └─ e2e/
      └─ *.e2e-spec.ts
```

## Naming and Placement Rules

- Unit test files:
  - `apps/**/**.spec.ts`
  - `common/**/**.spec.ts`
- Integration test files:
  - `test/integration/**.spec.ts`
- E2E test files:
  - `test/e2e/**.e2e-spec.ts`

## Script Mapping

- `pnpm run test` -> unit test suite (default CI gate)
- `pnpm run test:unit` -> unit only
- `pnpm run test:integration` -> integration only
- `pnpm run test:e2e` -> e2e only
- `pnpm run test:cov` -> unit coverage report

`test:unit` limits Jest to 2 workers by default to avoid `ts-jest` spawning one TypeScript compiler per CPU core on developer machines. Set `JEST_MAX_WORKERS=<n>` only when intentionally increasing local parallelism.

## Delivery Logic (What Must Be Covered Before Release)

- Merchant-order / payment-order / batch-order high-risk paths should at least include:
  - Unit:
    - DTO validation and input normalization
    - amount/status transition helpers
    - metadata/extraData parsing
  - Integration:
    - merchant order creation to payment and batch binding flows
    - cancel/refund state transitions with concurrency safety
    - compensation callback idempotency
  - E2E:
    - create order API contract
    - payment session API contract
    - cancel/refund API contract

## Guardrails

- No ad-hoc test files outside the allowed layout.
- Keep unit tests free of network/queue/database side effects.
- Integration and E2E tests must isolate external gateways (payment channels) via mocks/stubs.
