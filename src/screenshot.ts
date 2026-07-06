import type { Locator, Page, TestInfo } from '@playwright/test';

const settleRenderFrame = async (page: Page) => {
  await page.locator('body').waitFor({ state: 'visible' });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
};

const isDetachedError = (error: unknown) =>
  error instanceof Error && error.message.includes('Element is not attached');

const withDetachedRetry = async (run: () => Promise<void>, page: Page) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      lastError = error;
      if (!isDetachedError(error) || attempt === 4) throw error;
      await settleRenderFrame(page);
    }
  }

  if (lastError) throw lastError;
};

export async function takeDocScreenshot(
  testInfo: TestInfo,
  page: Page,
  locators: Locator | Locator[],
  caption?: string,
) {
  await settleRenderFrame(page);
  const focusPoints = Array.isArray(locators) ? locators : [locators];

  for (const locator of focusPoints) {
    await withDetachedRetry(async () => {
      const target = locator.first();
      await target.waitFor({ state: 'attached' });
      await target.evaluate((element) => {
        const htmlElement = element as HTMLElement;
        htmlElement.scrollIntoView({ behavior: 'instant', block: 'center' });
        htmlElement.dataset['docsPrevOutline'] = htmlElement.style.outline;
        htmlElement.dataset['docsPrevZIndex'] = htmlElement.style.zIndex;
        htmlElement.style.outline = '3px solid rgb(236, 72, 153)';
        htmlElement.style.zIndex = '10000';
      });
    }, page);
  }

  await testInfo.attach('image', {
    body: await page.screenshot({
      animations: 'disabled',
      style:
        '[data-testid="devtools"], .debug-toolbar, .tsqd-parent-container { display: none !important; }',
    }),
    contentType: 'image/png',
  });

  if (caption) {
    await testInfo.attach('image-caption', {
      body: caption,
      contentType: 'text/plain',
    });
  }

  for (const locator of focusPoints) {
    await withDetachedRetry(async () => {
      const target = locator.first();
      await target.waitFor({ state: 'attached' });
      await target.evaluate((element) => {
        const htmlElement = element as HTMLElement;
        htmlElement.style.outline =
          htmlElement.dataset['docsPrevOutline'] ?? '';
        htmlElement.style.zIndex = htmlElement.dataset['docsPrevZIndex'] ?? '';
        delete htmlElement.dataset['docsPrevOutline'];
        delete htmlElement.dataset['docsPrevZIndex'];
      });
    }, page).catch((error: unknown) => {
      if (!isDetachedError(error)) throw error;
    });
  }
}
