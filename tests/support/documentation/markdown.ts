import type { TestInfo } from '@playwright/test';

export async function attachMarkdown(testInfo: TestInfo, markdown: string) {
  await testInfo.attach('markdown', {
    body: markdown.trim(),
    contentType: 'text/markdown',
  });
}

export async function attachPermissions(
  testInfo: TestInfo,
  permissions: readonly string[],
) {
  await testInfo.attach('permissions', {
    body: permissions.join('\n'),
    contentType: 'text/plain',
  });
}
