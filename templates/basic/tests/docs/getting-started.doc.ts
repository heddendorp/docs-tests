import { attachMarkdown, takeDocScreenshot } from 'docs-tests';
import { expect, test } from 'docs-tests/test';

test.describe('Getting started', () => {
  test('Open the main surface', async ({ page }, testInfo) => {
    await page.goto('/');

    await attachMarkdown(
      testInfo,
      `
# Getting started

Open the product and confirm the main surface is ready.
Replace this prose with the first workflow your users or admins should learn.
`,
    );

    const main = page.getByRole('main').first();
    await expect(main).toBeVisible();
    await takeDocScreenshot(testInfo, page, main, 'Main product surface');
  });
});
