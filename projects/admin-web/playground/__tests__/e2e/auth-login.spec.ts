import { expect, test } from '@playwright/test';

import { authLogin } from './common/auth';

test.beforeEach(async ({ page }) => {
  const fulfill = (data: unknown) => ({
    body: JSON.stringify({ code: 0, data, message: 'ok' }),
    contentType: 'application/json',
    status: 200,
  });

  await page.route('**/auth/login', (route) =>
    route.fulfill(fulfill({ accessToken: 'e2e-token' })),
  );
  await page.route('**/user/info', (route) =>
    route.fulfill(
      fulfill({
        avatar: '',
        description: '',
        homePath: '/workspace',
        isOtpEnabled: false,
        nickname: 'E2E User',
        roles: [],
        uid: 'e2e-user',
        username: 'e2e-user',
      }),
    ),
  );
  await page.route('**/auth/codes', (route) => route.fulfill(fulfill([])));
  await page.route('**/menu/all', (route) => route.fulfill(fulfill([])));
  await page.goto('/');
});

test.describe('Auth Login Page Tests', () => {
  test('check title and page elements', async ({ page }) => {
    // 获取页面标题并断言标题包含 'Vben Admin'
    const title = await page.title();
    expect(title).toContain('Vben Admin');
  });

  // 测试用例: 成功登录
  test('should successfully login with valid credentials', async ({ page }) => {
    await authLogin(page);
    await expect(page).toHaveURL(/\/workspace$/);
  });
});
