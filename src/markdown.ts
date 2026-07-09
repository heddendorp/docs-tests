import type { TestInfo } from '@playwright/test';

import { DOCS_TESTS_ATTACHMENTS, attachPermissionsEvent } from './events.js';
import type { PermissionNote } from './schema.js';

export async function attachMarkdown(testInfo: TestInfo, markdown: string) {
  await testInfo.attach(DOCS_TESTS_ATTACHMENTS.markdown, {
    body: markdown.trim(),
    contentType: 'text/markdown',
  });
}

export async function attachPermissions(
  testInfo: TestInfo,
  permissions: readonly (string | PermissionNote)[],
) {
  await attachPermissionsEvent(testInfo, permissions);
}
