import { expect, test } from '../support/documentation/test';
import { attachMarkdown, takeDocScreenshot } from '../support/documentation';

test.describe('Getting started', () => {
  test('Open the dashboard', async ({ page }, testInfo) => {
    await page.goto('/');

    await attachMarkdown(
      testInfo,
      `
# Getting started

Open the app dashboard to confirm the app is available and ready to use.
Replace this example with the first workflow your users or admins should learn.
`,
    );

    const main = page.getByRole('main').first();
    await expect(main).toBeVisible();
    await takeDocScreenshot(testInfo, page, main, 'Dashboard');

    await attachMarkdown(
      testInfo,
      `
The generated guide is created from the same journey that verifies the page.
Keep assertions close to the claims made in the documentation text.
`,
    );
  });
});
