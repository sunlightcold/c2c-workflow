import type { Locator, Page } from '@playwright/test';

import { Buffer } from 'node:buffer';

import { expect, test } from '@playwright/test';

const tenantId = '00000000-0000-4000-8000-000000000001';
const pageErrors = new WeakMap<Page, string[]>();
const botListRequestCounts = new WeakMap<Page, number>();
const testCertificateDerBase64 = 'MA4wAwIBATADBgEqAwIA/w==';
const testCertificatePem = `-----BEGIN CERTIFICATE-----
${testCertificateDerBase64}
-----END CERTIFICATE-----`;

const pages = [
  ['所属单位', '/business/tenants', '/business/tenants', 'agency:tenant'],
  ['商家', '/business/merchants', '/business/merchants', 'merchant:account'],
  [
    '商家订单',
    '/business/merchant-orders',
    '/business/merchant-orders',
    'merchant:order',
  ],
  [
    '支付账号',
    '/business/payment-accounts',
    '/business/payment-accounts',
    'payment:account',
  ],
  [
    '支付订单',
    '/business/payment-orders',
    '/business/payment-orders',
    'payment:order',
  ],
  [
    '支付批次',
    '/business/payment-batches',
    '/business/payment-batches',
    'payment:batch',
  ],
  [
    '批次策略',
    '/business/payment-batch-policies',
    '/business/payment-batch-policies',
    'payment:batchPolicy',
  ],
  [
    '机器人实例',
    '/business/telegram-bots',
    '/business/telegram-bots',
    'telegram:bot',
  ],
  [
    '群组绑定',
    '/business/telegram-groups',
    '/business/telegram-groups',
    'telegram:group',
  ],
  [
    '群组成员',
    '/business/telegram-members',
    '/business/telegram-members',
    'telegram:member',
  ],
  [
    '超级管理员',
    '/business/telegram-super-admins',
    '/business/telegram-super-admins',
    'telegram:superAdmin',
  ],
] as const;

const permissions = [
  'dashboard',
  'dashboard:workspace',
  'business',
  'agency:tenant:read',
  'agency:tenant:create',
  'agency:tenant:update',
  'merchant:account:read',
  'merchant:account:create',
  'merchant:account:credential',
  'merchant:account:update',
  'merchant:order:read',
  'merchant:order:sync',
  'payment:account:read',
  'payment:account:create',
  'payment:account:update',
  'payment:account:delete',
  'payment:account:bind',
  'payment:order:read',
  'payment:order:create',
  'payment:order:retry',
  'payment:batch:read',
  'payment:batch:create',
  'payment:batch:submit',
  'payment:batch:retry',
  'payment:batchPolicy:read',
  'payment:batchPolicy:create',
  'payment:batchPolicy:update',
  'payment:batchPolicy:delete',
  'telegram:bot:read',
  'telegram:bot:create',
  'telegram:bot:update',
  'telegram:bot:delete',
  'telegram:group:read',
  'telegram:group:create',
  'telegram:group:update',
  'telegram:group:approve',
  'telegram:group:unbind',
  'telegram:member:read',
  'telegram:member:create',
  'telegram:member:update',
  'telegram:member:delete',
  'telegram:superAdmin:read',
  'telegram:superAdmin:create',
  'telegram:superAdmin:update',
  'telegram:superAdmin:delete',
];

function ok(data: unknown) {
  return { code: 200, data, message: 'ok' };
}

async function selectHeadquartersTenant(page: Page) {
  const tenantSelect = page.getByLabel('选择经营单位');
  await tenantSelect.click();
  await page
    .locator('.ant-select-item-option-content')
    .getByText('总部自营（总部自营）', { exact: true })
    .click();
  await expect(tenantSelect.locator('.ant-select-selection-item')).toHaveText(
    '总部自营（总部自营）',
  );
}

async function expectResponsiveTwoColumnForm(page: Page, dialog: Locator) {
  await expectDialogWithoutHorizontalOverflow(dialog);
  const row = dialog.locator('.ant-form > .ant-row').first();
  const halfWidthFields = row.locator(
    ':scope > .ant-col-xs-24.ant-col-md-12:visible',
  );
  await expect(halfWidthFields.first()).toBeVisible();
  expect(await halfWidthFields.count()).toBeGreaterThanOrEqual(2);

  const [rowBox, fieldBox] = await Promise.all([
    row.boundingBox(),
    halfWidthFields.first().boundingBox(),
  ]);
  if (!rowBox || !fieldBox) throw new Error('无法读取表单栅格尺寸');
  const widthRatio = fieldBox.width / rowBox.width;
  if ((page.viewportSize()?.width ?? 0) < 768) {
    expect(widthRatio).toBeGreaterThan(0.95);
  } else {
    expect(widthRatio).toBeGreaterThan(0.45);
    expect(widthRatio).toBeLessThan(0.55);
  }
}

async function expectDialogWithoutHorizontalOverflow(dialog: Locator) {
  const body = dialog.locator('.ant-modal-body');
  await expect(body).toBeVisible();
  await expect
    .poll(() => body.evaluate((element) => getComputedStyle(element).overflowX))
    .toBe('hidden');
}

async function expectDialogAboveDrawerAndInsideViewport(
  page: Page,
  dialog: Locator,
) {
  await expect(dialog).toBeVisible();
  await expectDialogWithoutHorizontalOverflow(dialog);
  const result = await dialog.evaluate((modal) => {
    const modalWrap = modal.closest<HTMLElement>('.ant-modal-wrap');
    const drawerRoot = [
      ...document.querySelectorAll<HTMLElement>('.ant-drawer'),
    ].find((drawer) => drawer.getBoundingClientRect().width > 0);
    if (!modalWrap || !drawerRoot) return null;
    const box = modal.getBoundingClientRect();
    return {
      insideViewport:
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= window.innerWidth &&
        box.bottom <= window.innerHeight,
      modalZIndex: Number.parseInt(getComputedStyle(modalWrap).zIndex, 10),
      drawerZIndex: Number.parseInt(getComputedStyle(drawerRoot).zIndex, 10),
    };
  });

  expect(result).not.toBeNull();
  expect(result?.modalZIndex).toBeGreaterThan(result?.drawerZIndex ?? 0);
  expect(result?.insideViewport).toBe(true);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  const tenantScopedPaths = new Set([
    '/sys/merchant-orders',
    '/sys/merchants',
    '/sys/payment-accounts',
    '/sys/payment-batch-policies',
    '/sys/payment-batches',
    '/sys/payment-orders',
    '/sys/tg/bots',
    '/sys/tg/groups',
    '/sys/tg/members',
    '/sys/tg/members/eligible-users',
    '/sys/tg/super-admins',
    '/sys/tg/super-admins/eligible-users',
  ]);
  let paymentPlans = [
    {
      batchPolicyId: '00000000-0000-4000-8000-000000000130',
      currency: 'CNY',
      id: '00000000-0000-4000-8000-000000000120',
      merchantId: '00000000-0000-4000-8000-000000000020',
      paymentAccountChannelId: '00000000-0000-4000-8000-000000000111',
      paymentAccountId: '00000000-0000-4000-8000-000000000110',
      priority: 100,
      scene: 'C2C_BUY',
      status: 'active',
      tenantId,
      weight: 100,
    },
  ];
  let paymentBatchPolicies = [
    {
      code: 'PBP202609100001',
      createdAt: '2026-09-10T08:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000130',
      merchantId: null,
      name: '总部批次策略',
      rules: [
        {
          id: '00000000-0000-4000-8000-000000000131',
          intervalSeconds: null,
          orderCount: null,
          policyId: '00000000-0000-4000-8000-000000000130',
          ruleType: 'MANUAL',
          status: 'active',
        },
      ],
      scopeType: 'GLOBAL',
      status: 'active',
      tenantId,
      updatedAt: '2026-09-10T08:00:00.000Z',
    },
  ];
  let botRuntimeRunning = true;
  let botRuntimeState = 'ONLINE';
  const botRuntimeMessage = () => {
    if (botRuntimeState === 'ONLINE') {
      return 'Telegram 连接正常，机器人正在运行';
    }
    if (botRuntimeState === 'CONNECTING') return '正在连接 Telegram';
    return '机器人已停止';
  };
  pageErrors.set(page, errors);
  botListRequestCounts.set(page, 0);
  page.on('pageerror', (error) => {
    errors.push(error.stack ?? error.message);
  });

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/v1', '');
    const requestBody = request.postDataJSON() as null | Record<
      string,
      unknown
    >;
    if (
      tenantScopedPaths.has(path) &&
      !url.searchParams.get('tenantId') &&
      !requestBody?.tenantId
    ) {
      errors.push(`租户业务接口缺少经营单位：${path}`);
    }
    const paymentPlanMatch = path.match(
      /^\/sys\/payment-plans\/([^/]+)(\/status)?$/,
    );
    const paymentBatchPolicyMatch = path.match(
      /^\/sys\/payment-batch-policies\/([^/]+)(\/status|\/submit)?$/,
    );
    const botRuntimeMatch = path.match(
      /^\/sys\/tg\/bots\/([^/]+)\/runtime\/(check|restart|start|stop)$/,
    );
    let data: unknown = null;

    if (botRuntimeMatch) {
      const action = botRuntimeMatch[2];
      if (action === 'stop') {
        botRuntimeRunning = false;
        botRuntimeState = 'NOT_STARTED';
      } else if (action === 'start' || action === 'restart') {
        botRuntimeRunning = true;
        botRuntimeState = 'CONNECTING';
      }
      data = {
        checkedAt: '2026-09-10T08:00:00.000Z',
        message: botRuntimeMessage(),
        runtimeRunning: botRuntimeRunning,
        state: botRuntimeState,
      };
      await route.fulfill({
        body: JSON.stringify(ok(data)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (paymentPlanMatch) {
      const planId = paymentPlanMatch[1];
      const method = request.method();
      const plan = paymentPlans.find(({ id }) => id === planId);
      if (method === 'PUT' && plan) {
        paymentPlans = paymentPlans.map((item) =>
          item.id === planId ? { ...item, ...request.postDataJSON() } : item,
        );
        data = paymentPlans.find(({ id }) => id === planId);
      } else if (method === 'PATCH' && plan && paymentPlanMatch[2]) {
        paymentPlans = paymentPlans.map((item) =>
          item.id === planId ? { ...item, ...request.postDataJSON() } : item,
        );
        data = paymentPlans.find(({ id }) => id === planId);
      } else if (method === 'DELETE' && plan) {
        paymentPlans = paymentPlans.filter(({ id }) => id !== planId);
      }
      await route.fulfill({
        body: JSON.stringify(ok(data)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (paymentBatchPolicyMatch) {
      const policyId = paymentBatchPolicyMatch[1];
      const suffix = paymentBatchPolicyMatch[2];
      const method = request.method();
      const policy = paymentBatchPolicies.find(({ id }) => id === policyId);
      if (method === 'PUT' && policy) {
        const input = request.postDataJSON() as {
          name: string;
          rules: Array<Record<string, unknown>>;
        };
        paymentBatchPolicies = paymentBatchPolicies.map((item) =>
          item.id === policyId
            ? {
                ...item,
                name: input.name,
                rules: input.rules.map((rule, index) => ({
                  ...rule,
                  id: `00000000-0000-4000-8000-${String(150 + index).padStart(12, '0')}`,
                  policyId,
                })),
              }
            : item,
        );
        data = paymentBatchPolicies.find(({ id }) => id === policyId);
      } else if (method === 'PATCH' && suffix === '/status' && policy) {
        paymentBatchPolicies = paymentBatchPolicies.map((item) =>
          item.id === policyId
            ? { ...item, status: requestBody?.status as string }
            : item,
        );
        data = paymentBatchPolicies.find(({ id }) => id === policyId);
      } else if (method === 'POST' && suffix === '/submit' && policy) {
        data = { batchCount: 1, orderCount: 2 };
      } else if (method === 'DELETE' && policy) {
        paymentBatchPolicies = paymentBatchPolicies.filter(
          ({ id }) => id !== policyId,
        );
      }
      await route.fulfill({
        body: JSON.stringify(ok(data)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    switch (path) {
      case '/auth/login': {
        data = { accessToken: 'e2e-token' };
        break;
      }
      case '/auth/optUrl': {
        data = { uri: '', uuid: '' };
        break;
      }
      case '/auth/permissions': {
        data = permissions;
        break;
      }
      case '/sys/menus/web': {
        data = [
          {
            children: null,
            component: '',
            icon: 'lucide:layout-dashboard',
            id: '1',
            keepAlive: 1,
            name: '概览',
            orderNo: 1000,
            parentId: null,
            path: '/dashboard',
            permission: 'dashboard',
            redirect: null,
            roles: [],
            show: 1,
            status: 1,
            type: 'FOLDER',
          },
          {
            children: null,
            component: '/dashboard/workspace',
            icon: 'lucide:layout-dashboard',
            id: '2',
            keepAlive: 1,
            name: '工作台',
            orderNo: 10,
            parentId: '1',
            path: '/workspace',
            permission: 'dashboard:workspace',
            redirect: null,
            roles: [],
            show: 1,
            status: 1,
            type: 'MENU',
          },
          {
            children: null,
            component: '',
            icon: 'lucide:briefcase-business',
            id: '100',
            keepAlive: 0,
            name: '业务运营',
            orderNo: 995,
            parentId: null,
            path: '/business',
            permission: 'business',
            redirect: null,
            roles: [],
            show: 1,
            status: 1,
            type: 'FOLDER',
          },
          ...pages.map(([name, routePath, component, permission], index) => ({
            children: null,
            component,
            icon: 'lucide:circle',
            id: String(101 + index),
            keepAlive: 1,
            name,
            orderNo: 60 - index * 10,
            parentId: '100',
            path: routePath,
            permission,
            redirect: null,
            roles: [],
            show: 1,
            status: 1,
            type: 'MENU',
          })),
        ];
        break;
      }
      case '/sys/merchant-orders':
      case '/sys/payment-batches':
      case '/sys/payment-orders': {
        data = { items: [], page: 1, pageSize: 20, total: 0 };
        break;
      }
      case '/sys/merchants': {
        data = {
          items: [
            {
              apiBaseUrl: 'https://api.binance.com',
              autoAppealDelayMinutes: 18,
              autoAppealEnabled: false,
              botCode: null,
              c2cChatOrderCompletedEnabled: false,
              c2cChatOrderCompletedMessage: null,
              c2cChatOrderCreatedEnabled: false,
              c2cChatOrderCreatedMessage: null,
              c2cChatOrderPaidEnabled: false,
              c2cChatOrderPaidMessage: null,
              chatId: null,
              code: 'BINANCE_MAIN',
              credentialConfigured: true,
              description: null,
              externalMerchantId: 'binance-merchant-main',
              id: '00000000-0000-4000-8000-000000000020',
              name: '币安主账号',
              orderStatusList: [1],
              overlapSeconds: 120,
              pageSize: 20,
              paidConfirmIntervalMaxMs: 0,
              paidConfirmIntervalMinMs: 0,
              platform: 'BINANCE',
              requestTimeoutMs: 15_000,
              status: 'active',
              tenantId,
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        };
        break;
      }
      case '/sys/payment-accounts': {
        data = {
          items: [
            {
              channels: [
                {
                  adapterCode: 'ALIPAY_BATCH_CERT',
                  channelCode: 'ALIPAY_BATCH',
                  channelId: '00000000-0000-4000-8000-000000000101',
                  channelName: '支付宝批量有密',
                  concurrencyLimit: 5,
                  executionMode: 'BATCH',
                  id: '00000000-0000-4000-8000-000000000111',
                  maximumAmount: '50000.00',
                  minimumAmount: '1.00',
                  status: 'active',
                },
              ],
              code: 'alipay-main',
              createdAt: '2026-09-10T08:00:00.000Z',
              credentialConfigured: true,
              credentialAppId: '2026000000000001',
              credentialAuthMode: 'KEY',
              credentialGateway: 'https://openapi.alipay.com/gateway.do',
              credentialUpdatedAt: '2026-09-10T08:00:00.000Z',
              externalAccountId: '2088123456789000',
              id: '00000000-0000-4000-8000-000000000110',
              name: '总部支付宝主账号',
              platformId: '00000000-0000-4000-8000-000000000100',
              status: 'active',
              tenantId,
              updatedAt: '2026-09-10T08:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        };
        break;
      }
      case '/sys/payment-batch-policies': {
        if (request.method() === 'POST') {
          const input = request.postDataJSON() as {
            merchantId?: string;
            name: string;
            rules: Array<Record<string, unknown>>;
            scopeType: 'GLOBAL' | 'MERCHANT';
          };
          const policyId = '00000000-0000-4000-8000-000000000140';
          const created = {
            code: 'PBP202609100002',
            createdAt: '2026-09-10T09:00:00.000Z',
            id: policyId,
            merchantId: input.merchantId ?? null,
            name: input.name,
            rules: input.rules.map((rule, index) => ({
              ...rule,
              id: `00000000-0000-4000-8000-${String(141 + index).padStart(12, '0')}`,
              policyId,
            })),
            scopeType: input.scopeType,
            status: 'active',
            tenantId,
            updatedAt: '2026-09-10T09:00:00.000Z',
          };
          paymentBatchPolicies = [created, ...paymentBatchPolicies];
          data = created;
        } else {
          const applicableMerchantId = url.searchParams.get(
            'applicableMerchantId',
          );
          const merchantId = url.searchParams.get('merchantId');
          const scopeType = url.searchParams.get('scopeType');
          const status = url.searchParams.get('status');
          const items = paymentBatchPolicies.filter(
            (policy) =>
              (!applicableMerchantId ||
                policy.scopeType === 'GLOBAL' ||
                policy.merchantId === applicableMerchantId) &&
              (!merchantId || policy.merchantId === merchantId) &&
              (!scopeType || policy.scopeType === scopeType) &&
              (!status || policy.status === status),
          );
          data = { items, page: 1, pageSize: 20, total: items.length };
        }
        break;
      }
      case '/sys/payment-plans': {
        data = paymentPlans;
        break;
      }
      case '/sys/payment-platforms': {
        data = [
          {
            channels: [
              {
                adapterCode: 'ALIPAY_BATCH_CERT',
                code: 'ALIPAY_BATCH',
                executionMode: 'BATCH',
                id: '00000000-0000-4000-8000-000000000101',
                name: '支付宝批量有密',
                status: 'active',
              },
              {
                adapterCode: 'ALIPAY_MERCHANT_TRANSFER',
                code: 'ALIPAY_MERCHANT_TRANSFER',
                executionMode: 'INSTANT',
                id: '00000000-0000-4000-8000-000000000102',
                name: '支付宝商家转账',
                status: 'active',
              },
            ],
            code: 'ALIPAY',
            id: '00000000-0000-4000-8000-000000000100',
            name: '支付宝',
            status: 'active',
          },
        ];
        break;
      }
      case '/sys/tenants': {
        data = [
          {
            code: 'HQ',
            createdAt: '2026-09-10T08:00:00.000Z',
            id: tenantId,
            name: '总部自营',
            status: 'active',
            systemLocked: true,
            timezone: 'Asia/Shanghai',
            type: 'HEADQUARTERS_SELF',
            updatedAt: '2026-09-10T08:00:00.000Z',
          },
        ];
        break;
      }
      case '/sys/tg/bots': {
        botListRequestCounts.set(
          page,
          (botListRequestCounts.get(page) ?? 0) + 1,
        );
        data = {
          items: [
            {
              batchSubmitRequireConfirmation: true,
              botType: 'PAYMENT',
              capabilities: ['MANUAL_PAYMENT', 'PAYMENT_BATCH_SUBMIT'],
              code: 'PAYMENT_MAIN',
              createdAt: '2026-09-10T08:00:00.000Z',
              description: null,
              id: '00000000-0000-4000-8000-000000000201',
              language: 'zh-CN',
              name: '总部支付机器人',
              paymentOrderRequireConfirmation: true,
              runtime: {
                checkedAt: '2026-09-10T08:00:00.000Z',
                message: botRuntimeMessage(),
                runtimeRunning: botRuntimeRunning,
                state: botRuntimeState,
                telegramUsername: 'payment_bot',
              },
              status: 'active',
              tenantId,
              tokenConfigured: true,
              updatedAt: '2026-09-10T08:00:00.000Z',
              webhookSecretConfigured: true,
              webhookUrl:
                'http://127.0.0.1:13001/v1/webhooks/telegram/PAYMENT_MAIN',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        };
        break;
      }
      case '/sys/tg/groups': {
        data = {
          items: [
            {
              bindingState: 'PENDING',
              botId: '00000000-0000-4000-8000-000000000201',
              capabilities: ['MANUAL_PAYMENT'],
              chatId: null,
              chatType: null,
              createdAt: '2026-09-10T08:00:00.000Z',
              id: '00000000-0000-4000-8000-000000000202',
              merchantId: '00000000-0000-4000-8000-000000000020',
              name: '总部支付群',
              notificationsEnabled: true,
              paymentScene: 'BOT_MANUAL',
              tenantId,
              updatedAt: '2026-09-10T08:00:00.000Z',
              verifiedAt: null,
            },
            {
              bindingState: 'ACTIVE',
              botId: '00000000-0000-4000-8000-000000000201',
              capabilities: ['C2C_ORDER_PAYMENT'],
              chatId: '-1001234567890',
              chatType: 'supergroup',
              createdAt: '2026-09-10T08:00:00.000Z',
              id: '00000000-0000-4000-8000-000000000205',
              merchantId: '00000000-0000-4000-8000-000000000020',
              name: '总部 C2C 支付群',
              notificationsEnabled: true,
              paymentScene: 'C2C_BUY',
              tenantId,
              updatedAt: '2026-09-10T08:00:00.000Z',
              verifiedAt: '2026-09-10T08:05:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 2,
        };
        break;
      }
      case '/sys/tg/members': {
        data = {
          items: [
            {
              capabilities: ['MANUAL_PAYMENT'],
              displayName: '值班员',
              groupId: '00000000-0000-4000-8000-000000000202',
              id: '00000000-0000-4000-8000-000000000203',
              role: 'OPERATOR',
              status: 'active',
              telegramUserId: '123456789',
              telegramUsername: 'operator',
              userId: 2,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        };
        break;
      }
      case '/sys/tg/members/eligible-users':
      case '/sys/tg/super-admins/eligible-users': {
        data = [{ id: 2, nickname: '平台运营', username: 'operator' }];
        break;
      }
      case '/sys/tg/super-admins': {
        data = {
          items: [
            {
              groupIds: ['00000000-0000-4000-8000-000000000202'],
              id: '00000000-0000-4000-8000-000000000204',
              scopeType: 'SPECIFIED_GROUPS',
              status: 'active',
              telegramUserId: '987654321',
              telegramUsername: 'supervisor',
              userId: 3,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        };
        break;
      }
      case '/sys/users/info': {
        data = {
          actorType: 'PLATFORM',
          isOtpEnabled: false,
          nickname: '平台运营',
          roles: ['platform-admin'],
          uid: '1',
          username: 'operator',
        };
        break;
      }
    }

    await route.fulfill({
      body: JSON.stringify(ok(data)),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/auth/login');
  const visibleInputs = page.locator('input:visible');
  await visibleInputs.nth(0).fill('operator');
  await visibleInputs.nth(1).fill('password');
  await visibleInputs.nth(2).fill('123456');
  await page.getByRole('button', { name: 'login' }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByText('哎呀！未找到页面')).toHaveCount(0);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test('loads all second-level business pages under one menu', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(90_000);
  if (testInfo.project.name === 'desktop-chromium') {
    await page.getByText('业务运营', { exact: true }).click();
    for (const [name] of pages) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  }

  for (const [name, path] of pages) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (name !== '所属单位') {
      const tenantSelect = page.getByLabel('选择经营单位');
      await expect(tenantSelect).toBeVisible();
      await expect(
        tenantSelect.locator('.ant-select-selection-item'),
      ).toHaveText('总部自营（总部自营）');
    }
  }

  await page.goto('/business/merchants');
  await selectHeadquartersTenant(page);
  await expect(
    page.getByRole('button', { name: '新增商家账号' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '新增商家账号' }).click();
  const createMerchantDialog = page.getByRole('dialog', {
    name: '新增商家账号',
  });
  await expect(
    createMerchantDialog.getByRole('combobox', { name: /交易平台/ }),
  ).toBeVisible();
  await expect(
    createMerchantDialog
      .getByRole('combobox', { name: /交易平台/ })
      .locator('.ant-select-selection-item'),
  ).toHaveCount(0);
  await expect(
    createMerchantDialog.getByText('账号编码', { exact: true }),
  ).toHaveCount(0);
  await expectResponsiveTwoColumnForm(page, createMerchantDialog);
  await createMerchantDialog.locator('.ant-btn-primary').click();
  await expect(createMerchantDialog.getByText('请输入账号名称')).toBeVisible();
  const dialogBox = await createMerchantDialog.boundingBox();
  const viewport = page.viewportSize();
  if (!dialogBox || !viewport) throw new Error('无法读取商家弹窗尺寸');
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.width).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({
    fullPage: true,
    path: `node_modules/.e2e/screenshots/business-operations-${testInfo.project.name}.png`,
  });
  await page.goto('/business/payment-accounts');
  await selectHeadquartersTenant(page);
  await expect(page.getByText('总部支付宝主账号')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '支付宝商户号' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '通道配置' }).click();
  const channelDrawer = page.locator('.ant-drawer-content:visible');
  const mobileProject = testInfo.project.name.includes('mobile');
  await expect(
    channelDrawer.getByText(
      mobileProject ? '通道配置' : '总部支付宝主账号 · 通道配置',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(channelDrawer.getByText('支付宝批量有密')).toBeVisible();
  await expect(
    channelDrawer.getByText('1.00 至 50000.00').first(),
  ).toBeVisible();
  const channelViewport = page.viewportSize();
  if (!channelViewport) throw new Error('无法读取通道抽屉尺寸');
  await expect
    .poll(async () => {
      const box = await channelDrawer.boundingBox();
      return Boolean(
        box &&
          box.x >= 0 &&
          box.x + box.width <= channelViewport.width &&
          (!mobileProject || box.width >= channelViewport.width * 0.9),
      );
    })
    .toBe(true);
  await (mobileProject
    ? expect(
        channelDrawer.getByTestId('payment-channel-mobile-list'),
      ).toBeVisible()
    : expect(channelDrawer.getByTestId('payment-channel-table')).toBeVisible());
  await expect(
    channelDrawer.getByRole('button', { name: '开通支付通道' }),
  ).toBeInViewport({ ratio: 1 });
  for (const actionName of [/编\s*辑/, /移\s*除/]) {
    await expect(
      channelDrawer.getByRole('button', { name: actionName }),
    ).toBeInViewport({ ratio: 1 });
  }
  await expect(
    channelDrawer.getByRole('button', { name: /停\s*用|启\s*用/ }),
  ).toHaveCount(0);
  await expect(
    channelDrawer.getByRole('switch', { name: '支付宝批量有密状态' }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: `node_modules/.e2e/screenshots/payment-accounts-${testInfo.project.name}.png`,
  });
  await channelDrawer.getByRole('button', { name: '开通支付通道' }).click();
  const openChannelDialog = page.getByRole('dialog', {
    name: '开通支付通道',
  });
  await expectDialogAboveDrawerAndInsideViewport(page, openChannelDialog);
  await page.screenshot({
    fullPage: true,
    path: `node_modules/.e2e/screenshots/payment-channel-modal-${testInfo.project.name}.png`,
  });
  await openChannelDialog.getByRole('button', { name: /取\s*消/ }).click();

  await channelDrawer.getByRole('button', { name: /编\s*辑/ }).click();
  const editChannelDialog = page.getByRole('dialog', {
    name: '编辑支付通道',
  });
  await expectDialogAboveDrawerAndInsideViewport(page, editChannelDialog);
  await expect(editChannelDialog.getByText('单笔最小金额')).toBeVisible();
  await expect(editChannelDialog.getByText('并发上限')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);

  await page.goto('/business/payment-orders');
  await selectHeadquartersTenant(page);
  await expect(
    page.getByRole('button', { name: '新增手工支付' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '新增手工支付' }).click();
  const createPaymentDialog = page.getByRole('dialog', {
    name: '新增手工支付',
  });
  await expect(createPaymentDialog).toBeVisible();
  await expectResponsiveTwoColumnForm(page, createPaymentDialog);
  await expect(
    createPaymentDialog
      .getByRole('combobox', { name: /商家/ })
      .locator('.ant-select-selection-item'),
  ).toHaveCount(0);
  const hasGlobalHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasGlobalHorizontalOverflow).toBe(false);

  await page.goto('/business/merchant-orders');
  await selectHeadquartersTenant(page);
  await expect(
    page
      .getByRole('combobox', { name: '商家账号' })
      .locator('.ant-select-selection-item'),
  ).toHaveCount(0);

  await page.goto('/business/payment-batches');
  await selectHeadquartersTenant(page);
  await expect(
    page
      .getByRole('combobox', { name: '商家' })
      .locator('.ant-select-selection-item'),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('combobox', { name: '支付账号' })
      .locator('.ant-select-selection-item'),
  ).toHaveCount(0);
});

test('manages payment plans inside the merchant configuration drawer', async ({
  page,
}) => {
  await page.goto('/business/merchants');
  await selectHeadquartersTenant(page);
  await page.getByRole('button', { name: /搜\s*索/ }).click();
  await page.getByRole('button', { name: /配\s*置/ }).click();

  const drawer = page.locator('.ant-drawer-content:visible');
  await drawer.getByRole('tab', { name: '支付方案' }).click();
  const planTable = drawer.getByTestId('payment-plan-table');
  await expect(planTable.getByText('总部支付宝主账号')).toBeVisible();
  for (const actionName of [/编\s*辑/, /删\s*除/]) {
    await expect(
      planTable.getByRole('button', { name: actionName }),
    ).toBeVisible();
  }
  await expect(
    planTable.getByRole('button', { name: /停\s*用|启\s*用/ }),
  ).toHaveCount(0);

  await drawer.getByRole('button', { name: '新增方案' }).click();
  const createDialog = page.getByRole('dialog', { name: '新增支付方案' });
  await expect(createDialog).toBeVisible();
  const createIsAboveDrawer = await page.evaluate(() => {
    const modal = document.querySelector<HTMLElement>('.ant-modal-wrap');
    const drawerRoot = document.querySelector<HTMLElement>('.ant-drawer');
    if (!modal || !drawerRoot) return false;
    return (
      Number.parseInt(getComputedStyle(modal).zIndex, 10) >
      Number.parseInt(getComputedStyle(drawerRoot).zIndex, 10)
    );
  });
  expect(createIsAboveDrawer).toBe(true);
  const routeField = createDialog
    .locator('.ant-form-item')
    .filter({ hasText: '支付账号与通道' });
  await routeField.locator('.ant-select-selector').click();
  const routeName = '总部支付宝主账号 · 支付宝批量有密';
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: routeName })
    .click({ timeout: 5000 });
  await expect(routeField.locator('.ant-select-selection-item')).toHaveText(
    routeName,
  );
  const batchPolicyField = createDialog
    .locator('.ant-form-item')
    .filter({ hasText: '批次策略' });
  await expect(batchPolicyField).toBeVisible();
  await createDialog.getByRole('button', { name: /确\s*定/ }).click();
  await expect(
    createDialog.getByText('批量支付方案必须选择批次策略'),
  ).toBeVisible();
  await batchPolicyField.locator('.ant-select-selector').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '全局 · 总部批次策略' })
    .click({ timeout: 5000 });
  await expect(
    batchPolicyField.locator('.ant-select-selection-item'),
  ).toHaveText('全局 · 总部批次策略');

  await createDialog.getByRole('button', { name: /取\s*消/ }).click();

  await planTable.getByRole('button', { name: /编\s*辑/ }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑支付方案' });
  await expect(editDialog).toBeVisible();
  const priority = editDialog.getByRole('spinbutton', { name: /使用顺序/ });
  await expect(priority).toHaveValue('100');
  await priority.fill('20');
  const updateRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      request.url().includes('/v1/sys/payment-plans/'),
  );
  await editDialog.getByRole('button', { name: /确\s*定/ }).click();
  const updatedPlanRequest = await updateRequest;
  expect(updatedPlanRequest.postDataJSON()).toMatchObject({
    batchPolicyId: '00000000-0000-4000-8000-000000000130',
    priority: 20,
  });
  await expect(planTable.getByText('20', { exact: true })).toBeVisible();

  const statusRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' && request.url().includes('/status'),
  );
  const planStatusSwitch = planTable.getByRole('switch', {
    name: '总部支付宝主账号支付方案状态',
  });
  await planStatusSwitch.click();
  const updatedStatusRequest = await statusRequest;
  expect(updatedStatusRequest.postDataJSON()).toEqual({ status: 'disabled' });
  await expect(planStatusSwitch).not.toBeChecked();

  await planTable.getByRole('button', { name: /删\s*除/ }).click();
  const confirmDialog = page.locator('.ant-modal-confirm:visible');
  await expect(
    confirmDialog.getByText('确认删除支付方案吗？', { exact: true }),
  ).toBeVisible();
  const confirmIsAboveDrawer = await page.evaluate(() => {
    const confirm = document.querySelector<HTMLElement>(
      '.ant-modal-root:has(.ant-modal-confirm) .ant-modal-wrap',
    );
    const drawerRoot = document.querySelector<HTMLElement>('.ant-drawer');
    if (!confirm || !drawerRoot) return false;
    return (
      Number.parseInt(getComputedStyle(confirm).zIndex, 10) >
      Number.parseInt(getComputedStyle(drawerRoot).zIndex, 10)
    );
  });
  expect(confirmIsAboveDrawer).toBe(true);
  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' &&
      request.url().includes('/v1/sys/payment-plans/'),
  );
  await confirmDialog.getByRole('button', { name: /删\s*除/ }).click();
  await deleteRequest;
  await expect(planTable.getByText('总部支付宝主账号')).toHaveCount(0);
});

test('manages parallel payment batch policy rules without horizontal overflow', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  await page.goto('/business/payment-batch-policies');
  await selectHeadquartersTenant(page);

  await expect(
    page.getByText('手动提交', { exact: true }).first(),
  ).toBeVisible();
  const submitRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/submit'),
  );
  await page.getByRole('button', { name: '手动提交' }).click();
  const submitConfirm = page.locator('.ant-modal-confirm:visible');
  await submitConfirm.getByRole('button', { name: /确\s*定/ }).click();
  const submittedRequest = await submitRequest;
  expect(submittedRequest.postDataJSON()).toEqual({ tenantId });
  await expect(submitConfirm).toBeHidden();

  await page.getByRole('button', { name: '新增批次策略' }).click();
  const createDialog = page.getByRole('dialog', { name: '新增批次策略' });
  await expectDialogWithoutHorizontalOverflow(createDialog);
  await createDialog
    .getByRole('textbox', { name: '策略名称' })
    .fill('晚间并行策略');
  await createDialog
    .locator('.ant-select-selector')
    .nth(0)
    .click({ force: true });
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '指定商家' })
    .click();
  await createDialog
    .locator('.ant-select-selector')
    .nth(1)
    .click({ force: true });
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '币安主账号' })
    .click();

  await createDialog
    .getByTestId('payment-batch-policy-rule')
    .nth(0)
    .locator('.ant-select-selector')
    .click({ force: true });
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '按时间间隔' })
    .click();
  await createDialog
    .getByRole('spinbutton', { name: '规则 1 时间间隔' })
    .fill('120');

  await createDialog.getByRole('button', { name: '添加规则' }).click();
  await createDialog
    .getByTestId('payment-batch-policy-rule')
    .nth(1)
    .locator('.ant-select-selector')
    .click({ force: true });
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '按订单数' })
    .last()
    .click();
  await createDialog
    .getByRole('spinbutton', { name: '规则 2 订单数' })
    .fill('20');

  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/payment-batch-policies'),
  );
  await createDialog.getByRole('button', { name: /确\s*定/ }).click();
  const createdRequest = await createRequest;
  expect(createdRequest.postDataJSON()).toMatchObject({
    merchantId: '00000000-0000-4000-8000-000000000020',
    name: '晚间并行策略',
    rules: [
      {
        intervalSeconds: 120,
        ruleType: 'INTERVAL',
        status: 'active',
      },
      { orderCount: 20, ruleType: 'ORDER_COUNT', status: 'active' },
    ],
    scopeType: 'MERCHANT',
    tenantId,
  });

  let createdRow = page.locator('tr').filter({ hasText: '晚间并行策略' });
  await expect(createdRow.getByText('间隔 120 秒')).toBeVisible();
  await expect(createdRow.getByText('满 20 笔')).toBeVisible();
  await expect(
    createdRow.getByRole('button', { name: '手动提交' }),
  ).toHaveCount(0);

  await page
    .getByRole('button', { name: /编\s*辑/ })
    .first()
    .click();
  const editDialog = page.getByRole('dialog', { name: '编辑批次策略' });
  const nameInput = editDialog.getByRole('textbox', { name: '策略名称' });
  await nameInput.fill('晚间并行策略（已调整）');
  const updateRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      request.url().includes('/payment-batch-policies/'),
  );
  await editDialog.getByRole('button', { name: /确\s*定/ }).click();
  const updatedRequest = await updateRequest;
  expect(updatedRequest.postDataJSON()).toMatchObject({
    name: '晚间并行策略（已调整）',
  });

  createdRow = page.locator('tr').filter({ hasText: '晚间并行策略（已调整）' });
  const statusSwitch = page.getByRole('switch', {
    name: '晚间并行策略（已调整）状态',
  });
  const disableRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' && request.url().endsWith('/status'),
  );
  await statusSwitch.click();
  const disabledRequest = await disableRequest;
  expect(disabledRequest.postDataJSON()).toMatchObject({
    status: 'disabled',
    tenantId,
  });
  await expect(statusSwitch).not.toBeChecked();

  const enableRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' && request.url().endsWith('/status'),
  );
  await statusSwitch.click();
  const enabledRequest = await enableRequest;
  expect(enabledRequest.postDataJSON()).toMatchObject({
    status: 'active',
    tenantId,
  });
  await expect(statusSwitch).toBeChecked();

  await page
    .getByRole('button', { name: /删\s*除/ })
    .first()
    .click();
  const deleteConfirm = page.locator('.ant-modal-confirm:visible');
  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' &&
      request.url().includes('/payment-batch-policies/'),
  );
  await deleteConfirm.getByRole('button', { name: /删\s*除/ }).click();
  await deleteRequest;
  await expect(page.getByText('晚间并行策略（已调整）')).toHaveCount(0);
});

test('creates a tenant-global batch policy before any merchant exists', async ({
  page,
}) => {
  await page.route('**/v1/sys/merchants**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(ok({ items: [], page: 1, pageSize: 100, total: 0 })),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.goto('/business/payment-batch-policies');
  await selectHeadquartersTenant(page);

  const createButton = page.getByRole('button', { name: '新增批次策略' });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const createDialog = page.getByRole('dialog', { name: '新增批次策略' });
  await createDialog.getByLabel('策略名称').fill('经营单位默认策略');
  await createDialog
    .locator('.ant-select-selector')
    .first()
    .click({ force: true });
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '经营单位全局' })
    .click();
  await expect(createDialog.getByLabel('商家账号')).toHaveCount(0);

  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/payment-batch-policies'),
  );
  await createDialog.getByRole('button', { name: /确\s*定/ }).click();
  const createdRequest = await createRequest;
  const payload = createdRequest.postDataJSON();
  expect(payload).toMatchObject({
    name: '经营单位默认策略',
    rules: [{ ruleType: 'MANUAL', status: 'active' }],
    scopeType: 'GLOBAL',
    tenantId,
  });
  expect(payload).not.toHaveProperty('merchantId');

  const createdRow = page.locator('tr').filter({
    hasText: '经营单位默认策略',
  });
  await expect(createdRow.getByText('经营单位全局')).toBeVisible();
  await expect(createdRow.getByText('全部商家')).toBeVisible();
  await expect(
    page.locator('button:visible').filter({ hasText: '手动提交' }).first(),
  ).toBeVisible();
});

test('lists selectable channels when opening a payment channel', async ({
  page,
}) => {
  await page.goto('/business/payment-accounts');
  await selectHeadquartersTenant(page);
  await page.getByRole('button', { name: '通道配置' }).click();

  const channelDrawer = page.locator('.ant-drawer-content:visible');
  await channelDrawer.getByRole('button', { name: '开通支付通道' }).click();
  const dialog = page.getByRole('dialog', { name: '开通支付通道' });
  const channelField = dialog
    .locator('.ant-form-item')
    .filter({ hasText: '支付通道' });
  await channelField.locator('.ant-select-selector').click();

  const channelName = '支付宝商家转账 · 商家转账';
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: channelName })
    .click({ timeout: 5000 });
  await expect(channelField.locator('.ant-select-selection-item')).toHaveText(
    channelName,
  );
});

test('selects a bound robot group and restores default merchant chat messages', async ({
  page,
}, testInfo) => {
  await page.goto('/business/merchants');
  await selectHeadquartersTenant(page);
  await page.getByRole('button', { name: /搜\s*索/ }).click();
  await page.getByRole('button', { name: /编\s*辑/ }).click();

  const dialog = page.getByRole('dialog', { name: '编辑商家账号' });
  await expect(dialog.getByText('支付机器人编码', { exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByText('Telegram 群组 ID', { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: /下单后消息/ })).toHaveValue(
    /原则上不接受亲友、公司、员工、客户或其他第三方账户代收/,
  );
  await expect(dialog.getByRole('textbox', { name: /付款后消息/ })).toHaveValue(
    /请您登录核实收款账户实际到账情况/,
  );
  await expect(dialog.getByRole('textbox', { name: /完成后消息/ })).toHaveValue(
    /您的每一次认可都是我们持续做好服务的动力/,
  );

  const groupCombobox = dialog.getByRole('combobox', { name: /机器人群组/ });
  await groupCombobox.press('ArrowDown');
  await page
    .getByText('总部 C2C 支付群 · 总部支付机器人', { exact: true })
    .click();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.screenshot({
    fullPage: !testInfo.project.name.includes('mobile'),
    path: `node_modules/.e2e/screenshots/merchant-robot-group-${testInfo.project.name}.png`,
  });
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      request
        .url()
        .includes('/v1/sys/merchants/00000000-0000-4000-8000-000000000020'),
  );
  await dialog.getByRole('button', { name: /确\s*定/ }).click();
  const request = await requestPromise;

  expect(request.postDataJSON()).toMatchObject({
    telegramGroupId: '00000000-0000-4000-8000-000000000205',
    tenantId,
  });
  expect(request.postDataJSON()).not.toHaveProperty('botCode');
  expect(request.postDataJSON()).not.toHaveProperty('chatId');
});

test('provides complete Telegram administration actions', async ({ page }) => {
  const assertions = [
    {
      create: '新增机器人',
      editDialog: '编辑支付机器人',
      path: '/business/telegram-bots',
      rowText: '总部支付机器人',
    },
    {
      create: '新增群组绑定',
      editDialog: '编辑群组绑定',
      path: '/business/telegram-groups',
      rowText: '总部支付群',
    },
    {
      create: '新增群组成员',
      editDialog: '编辑群组成员',
      path: '/business/telegram-members',
      rowText: '123456789',
    },
    {
      create: '新增超级管理员',
      editDialog: '编辑超级管理员',
      path: '/business/telegram-super-admins',
      rowText: '987654321',
    },
  ] as const;

  for (const assertion of assertions) {
    await page.goto(assertion.path);
    await selectHeadquartersTenant(page);
    await expect(
      page.getByText(assertion.rowText, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: assertion.create }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: /编\s*辑/ })
      .first()
      .click();
    const editDialog = page.getByRole('dialog', {
      name: assertion.editDialog,
    });
    await expect(editDialog).toBeVisible();
    await expectResponsiveTwoColumnForm(page, editDialog);
    await editDialog.getByRole('button', { name: /取\s*消/ }).click();
    await expect(editDialog).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  }

  await page.goto('/business/telegram-groups');
  await selectHeadquartersTenant(page);
  await expect(page.getByRole('button', { name: /审\s*批/ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /解\s*绑/ }).first(),
  ).toBeVisible();

  await page.goto('/business/telegram-members');
  await selectHeadquartersTenant(page);
  await expect(page.getByRole('switch', { name: '值班员状态' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /停\s*用|启\s*用/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /移\s*除/ })).toBeVisible();

  await page.goto('/business/telegram-super-admins');
  await selectHeadquartersTenant(page);
  await expect(
    page.getByRole('switch', { name: 'supervisor状态' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /停\s*用|启\s*用/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /移\s*除/ })).toBeVisible();

  await page.goto('/business/telegram-bots');
  await selectHeadquartersTenant(page);
  await expect(page.getByText('已连接', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Telegram 连接正常，机器人正在运行'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /检\s*测/ })).toHaveCount(0);
  const botStatusSwitch = page.getByRole('switch', {
    name: '总部支付机器人账号状态',
  });
  const runtimeSwitch = page.getByRole('switch', {
    name: '总部支付机器人运行状态',
  });
  await expect(botStatusSwitch).toBeChecked();
  await expect(runtimeSwitch).toBeChecked();
  await expect(
    page.getByRole('button', { name: /停\s*用|启\s*用|启\s*动|停\s*止/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /重\s*启/ })).toBeVisible();

  const restartRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().includes('/runtime/restart'),
  );
  await page.getByRole('button', { name: /重\s*启/ }).click();
  const restartedRequest = await restartRequest;
  expect(new URL(restartedRequest.url()).searchParams.get('tenantId')).toBe(
    tenantId,
  );
  expect(restartedRequest.postData()).toBeNull();

  await page.evaluate(
    async ({ botId, currentTenantId }) => {
      await fetch(
        `/v1/sys/tg/bots/${botId}/runtime/stop?tenantId=${currentTenantId}`,
        { method: 'POST' },
      );
    },
    {
      botId: '00000000-0000-4000-8000-000000000201',
      currentTenantId: tenantId,
    },
  );
  await page.reload();
  await selectHeadquartersTenant(page);
  const stoppedRuntimeSwitch = page.getByRole('switch', {
    name: '总部支付机器人运行状态',
  });
  await expect(stoppedRuntimeSwitch).not.toBeChecked();
  await expect(page.getByRole('button', { name: /重\s*启/ })).toHaveCount(0);

  const startRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().includes('/runtime/start'),
  );
  await stoppedRuntimeSwitch.click();
  const startedRequest = await startRequest;
  expect(startedRequest.postData()).toBeNull();
  await expect(page.getByRole('button', { name: /重\s*启/ })).toBeVisible();

  const listRequestCount = botListRequestCounts.get(page);
  await page.waitForTimeout(5500);
  expect(botListRequestCounts.get(page)).toBe(listRequestCount);
});

test('creates a Telegram bot with a Bot Token instead of an internal reference', async ({
  page,
}) => {
  await page.goto('/business/telegram-bots');
  await selectHeadquartersTenant(page);
  await page.getByRole('button', { name: '新增机器人' }).click();

  const dialog = page.getByRole('dialog', { name: '新增支付机器人' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('textbox', { name: /机器人名称/ })
    .fill('新增测试机器人');
  await dialog
    .getByRole('textbox', { name: /Bot Token/ })
    .fill('1234567890:AAabcdefghijklmnopQRST_uvwx');
  await dialog.getByRole('checkbox').first().check();

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().includes('/v1/sys/tg/bots'),
  );
  await dialog.getByRole('button', { name: /确\s*定/ }).click();
  const request = await requestPromise;

  expect(request.postDataJSON()).toMatchObject({
    name: '新增测试机器人',
    tenantId,
    token: '1234567890:AAabcdefghijklmnopQRST_uvwx',
  });
  expect(request.postDataJSON()).not.toHaveProperty('code');
  expect(request.postDataJSON()).not.toHaveProperty('tokenRef');
});

test('keeps internal business codes out of create forms', async ({
  page,
}, testInfo) => {
  await page.goto('/business/tenants');
  await page.getByRole('button', { name: '新增代理商' }).click();
  const tenantDialog = page.getByRole('dialog', { name: '新增代理商' });
  await expect(
    tenantDialog.getByText('代理商编码', { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/business/payment-accounts');
  await selectHeadquartersTenant(page);
  await page.getByRole('button', { name: '新增支付账号' }).click();
  const accountDialog = page.getByRole('dialog', { name: '新增支付账号' });
  await expect(
    accountDialog.getByText('账号编码', { exact: true }),
  ).toHaveCount(0);
  await expect(
    accountDialog
      .getByRole('combobox', { name: /支付平台/ })
      .locator('.ant-select-selection-item'),
  ).toHaveCount(0);
  await expectResponsiveTwoColumnForm(page, accountDialog);
  await page.screenshot({
    fullPage: true,
    path: `node_modules/.e2e/screenshots/payment-account-create-form-${testInfo.project.name}.png`,
  });
  await page.keyboard.press('Escape');

  await page.goto('/business/telegram-bots');
  await selectHeadquartersTenant(page);
  await page.getByRole('button', { name: '新增机器人' }).click();
  const botDialog = page.getByRole('dialog', { name: '新增支付机器人' });
  await expect(botDialog.getByText('机器人编码', { exact: true })).toHaveCount(
    0,
  );
});

test('keeps internal business codes out of filters and tables', async ({
  page,
}, testInfo) => {
  await page.goto('/business/tenants');
  await expect(
    page.locator('.vxe-grid').getByText('总部自营', { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText('单位编码', { exact: true })).toHaveCount(0);
  await expect(page.getByText('HQ', { exact: true })).toHaveCount(0);

  await page.goto('/business/merchants');
  await selectHeadquartersTenant(page);
  await expect(page.getByText('币安主账号', { exact: true })).toBeVisible();
  await expect(page.getByText('账号编码', { exact: true })).toHaveCount(0);
  await expect(page.getByText('BINANCE_MAIN', { exact: true })).toHaveCount(0);
  await expect(page.getByText('同步配置', { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole('combobox', { name: '交易平台' })
      .locator('.ant-select-selection-item'),
  ).toHaveCount(0);
  await expect(
    page.getByText('binance-merchant-main', { exact: true }),
  ).toBeVisible();
  if (testInfo.project.name === 'desktop-chromium') {
    await page.setViewportSize({ height: 800, width: 1920 });
  }
  await expect(page.getByText('加载菜单中...')).toBeHidden();
  await page.screenshot({
    fullPage: true,
    path: `node_modules/.e2e/screenshots/merchant-list-${testInfo.project.name}.png`,
  });

  await page.goto('/business/payment-accounts');
  await selectHeadquartersTenant(page);
  await expect(
    page.getByText('总部支付宝主账号', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('账号编码', { exact: true })).toHaveCount(0);
  await expect(page.getByText('alipay-main', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('2088123456789000', { exact: true }),
  ).toBeVisible();

  await page.goto('/business/telegram-bots');
  await selectHeadquartersTenant(page);
  await expect(page.getByText('总部支付机器人', { exact: true })).toBeVisible();
  await expect(page.getByText('机器人编码', { exact: true })).toHaveCount(0);
  await expect(page.getByText('机器人类型', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PAYMENT_MAIN', { exact: true })).toHaveCount(0);

  await page.goto('/business/payment-batch-policies');
  await selectHeadquartersTenant(page);
  await expect(page.getByText('总部批次策略', { exact: true })).toBeVisible();
  await expect(page.getByText('策略编号', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PBP202609100001', { exact: true })).toHaveCount(
    0,
  );
});

test('edits the payment account and its credential in one form and request', async ({
  page,
}, testInfo) => {
  await page.goto('/business/payment-accounts');
  await selectHeadquartersTenant(page);
  await expect(page.getByText('公钥模式', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '凭据配置' })).toHaveCount(0);
  await page.getByRole('button', { name: '编辑', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '编辑支付账号' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: /账号名称/ })).toHaveValue(
    '总部支付宝主账号',
  );
  await expect(
    dialog.getByRole('textbox', { name: /支付宝商户号/ }),
  ).toHaveValue('2088123456789000');
  await expect(
    dialog.getByRole('textbox', { name: /支付宝应用 ID/ }),
  ).toHaveValue('2026000000000001');
  const customGateway = 'http://payment-mock.internal/alipay/gateway.do';
  const gatewayInput = dialog.getByRole('textbox', { name: /API 网关地址/ });
  await expect(gatewayInput).toHaveValue(
    'https://openapi.alipay.com/gateway.do',
  );
  await gatewayInput.fill(customGateway);
  await dialog.getByText('证书模式', { exact: true }).click();
  await expect(dialog.getByText('应用公钥证书', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('支付宝公钥证书', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('支付宝根证书', { exact: true })).toBeVisible();

  const privateKeyInput = dialog.getByRole('textbox', { name: '应用私钥' });
  const appCertInput = dialog.getByRole('textbox', { name: '应用公钥证书' });
  await expect(privateKeyInput).toHaveAttribute(
    'placeholder',
    '留空保留现有内容，也可粘贴或读取新文件',
  );
  await privateKeyInput.fill('pasted-application-private-key');

  const privateKeyBox = await privateKeyInput.boundingBox();
  const appCertBox = await appCertInput.boundingBox();
  const alipayPublicCertBox = await dialog
    .getByRole('textbox', { name: '支付宝公钥证书' })
    .boundingBox();
  expect(privateKeyBox).not.toBeNull();
  expect(appCertBox).not.toBeNull();
  expect(alipayPublicCertBox).not.toBeNull();
  if (!privateKeyBox || !appCertBox || !alipayPublicCertBox) {
    throw new Error('Credential inputs are not rendered');
  }
  if (testInfo.project.name === 'mobile-chromium') {
    expect(Math.abs(privateKeyBox.x - appCertBox.x)).toBeLessThan(8);
    expect(appCertBox.y).toBeGreaterThan(privateKeyBox.y);
  } else {
    expect(appCertBox.y).toBeGreaterThan(privateKeyBox.y);
    expect(Math.abs(appCertBox.y - alipayPublicCertBox.y)).toBeLessThan(8);
    expect(alipayPublicCertBox.x).toBeGreaterThan(appCertBox.x);
  }

  const certificateFileInputs = [
    dialog.getByLabel('读取应用公钥证书'),
    dialog.getByLabel('读取支付宝公钥证书'),
    dialog.getByLabel('读取支付宝根证书'),
  ];
  const selectedFiles = [
    {
      buffer: Buffer.from(testCertificateDerBase64, 'base64'),
      mimeType: 'application/pkix-cert',
      name: 'app-cert.crt',
    },
    {
      buffer: Buffer.from(testCertificatePem),
      mimeType: 'application/x-pem-file',
      name: 'alipay-public-cert.cer',
    },
    {
      buffer: Buffer.from(`${testCertificatePem}\n${testCertificatePem}`),
      mimeType: 'application/x-pem-file',
      name: 'alipay-root-cert.pem',
    },
  ];
  for (const [index, file] of selectedFiles.entries()) {
    const fileInput = certificateFileInputs[index];
    if (!fileInput) {
      throw new Error(`Missing credential file input: ${file.name}`);
    }
    await fileInput.setInputFiles(file);
  }
  await expect(appCertInput).toHaveValue(testCertificatePem);
  await page.screenshot({
    fullPage: true,
    path: `node_modules/.e2e/screenshots/payment-credential-input-${testInfo.project.name}.png`,
  });

  const updateRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      request
        .url()
        .endsWith(
          '/v1/sys/payment-accounts/00000000-0000-4000-8000-000000000110',
        ),
    { timeout: 8000 },
  );
  await dialog.getByRole('button', { name: /确\s*定/ }).click();
  await expect(dialog.locator('.ant-form-item-explain-error')).toHaveCount(0);
  const request = await updateRequest;
  const payload = request.postDataJSON();
  expect(payload).toMatchObject({
    credential: {
      appCertContent: testCertificatePem,
      authMode: 'CERT',
      alipayPublicCertContent: testCertificatePem,
      alipayRootCertContent: `${testCertificatePem}\n${testCertificatePem}`,
      gateway: customGateway,
      privateKey: 'pasted-application-private-key',
    },
    externalAccountId: '2088123456789000',
    name: '总部支付宝主账号',
    tenantId,
  });
  expect(payload.credential).not.toHaveProperty('alipayPublicKey');
});
