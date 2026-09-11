import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

const tenantId = '00000000-0000-4000-8000-000000000001';
const pageErrors = new WeakMap<Page, string[]>();

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
];

function ok(data: unknown) {
  return { code: 200, data, message: 'ok' };
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => {
    errors.push(error.stack ?? error.message);
  });

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/v1', '');
    let data: unknown = null;

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
        data = { items: [], page: 1, pageSize: 100, total: 0 };
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

test('loads the six second-level business pages under one menu', async ({
  page,
}, testInfo) => {
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
      await expect(page.getByLabel('选择经营单位')).toBeVisible();
    }
  }

  await page.goto('/business/merchants');
  await page.getByLabel('选择经营单位').click();
  await page
    .locator('.ant-select-item-option-content')
    .getByText('总部自营（总部自营）', { exact: true })
    .click();
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
  const selectedPlatform = createMerchantDialog.getByText('币安', {
    exact: true,
  });
  await expect(selectedPlatform).toBeVisible();
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
  await page.getByLabel('选择经营单位').click();
  await page
    .locator('.ant-select-item-option-content')
    .getByText('总部自营（总部自营）', { exact: true })
    .click();
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
  await expect(channelDrawer.getByText('1.00 至 50000.00')).toBeVisible();
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
  for (const actionName of [/编\s*辑/, /停\s*用/, /移\s*除/]) {
    await expect(
      channelDrawer.getByRole('button', { name: actionName }),
    ).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({
    fullPage: true,
    path: `node_modules/.e2e/screenshots/payment-accounts-${testInfo.project.name}.png`,
  });
  await channelDrawer.getByRole('button', { name: /编\s*辑/ }).click();
  const editChannelDialog = page.getByRole('dialog', {
    name: '编辑支付通道',
  });
  await expect(editChannelDialog.getByText('单笔最小金额')).toBeVisible();
  await expect(editChannelDialog.getByText('并发上限')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);

  await page.goto('/business/payment-orders');
  await page.getByLabel('选择经营单位').click();
  await page
    .locator('.ant-select-item-option-content')
    .getByText('总部自营（总部自营）', { exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '新增手工支付' }),
  ).toBeDisabled();
  const hasGlobalHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasGlobalHorizontalOverflow).toBe(false);
});
