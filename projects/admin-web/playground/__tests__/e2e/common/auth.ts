import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

export async function authLogin(page: Page) {
  // 确保登录表单正常
  const usernameInput = await page.locator(`input[name='username']`);
  await expect(usernameInput).toBeVisible();

  const passwordInput = await page.locator(`input[name='password']`);
  await expect(passwordInput).toBeVisible();

  const sliderCaptcha = await page.locator(`div[name='captcha']`);
  const sliderCaptchaAction = await page.locator(`div[name='captcha-action']`);
  await expect(sliderCaptcha).toBeVisible();
  await expect(sliderCaptchaAction).toBeVisible();
  await sliderCaptchaAction.hover();

  // 拖动验证码滑块
  // 获取拖动按钮的位置
  const sliderCaptchaBox = await sliderCaptcha.boundingBox();
  if (!sliderCaptchaBox) throw new Error('滑块未找到');

  const actionBoundingBox = await sliderCaptchaAction.boundingBox();
  if (!actionBoundingBox) throw new Error('要拖动的按钮未找到');

  // 计算起始位置和目标位置
  const startX = actionBoundingBox.x + actionBoundingBox.width / 2; // div 中心的 x 坐标
  const startY = actionBoundingBox.y + actionBoundingBox.height / 2; // div 中心的 y 坐标

  const targetX =
    sliderCaptchaBox.x +
    sliderCaptchaBox.width -
    actionBoundingBox.width / 2 -
    1;
  const targetY = startY;

  // 模拟鼠标拖动
  await page.mouse.move(startX, startY); // 移动到 action 的中心
  await page.mouse.down(); // 按下鼠标
  await page.mouse.move(targetX, targetY, { steps: 20 }); // 拖动到目标位置
  await page.mouse.up(); // 松开鼠标

  await expect(sliderCaptcha).toContainText(/Passed|验证通过/);

  // 到这里已经校验成功，点击进行登录
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'login' }).click();
}
