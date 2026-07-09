import type { TestInfo } from '@playwright/test';

import {
  normalizeGuideMetadata,
  normalizePermissionNote,
  type GuideMetadata,
  type PermissionNote,
} from './schema.js';

export const DOCS_TESTS_ATTACHMENTS = {
  guide: 'docs-tests:guide',
  imageMetadata: 'docs-tests:image-metadata',
  imagePrefix: 'docs-tests:image:',
  markdown: 'docs-tests:markdown',
  permissions: 'docs-tests:permissions',
} as const;

export const DOCS_TESTS_CONTENT_TYPES = {
  guide: 'application/vnd.docs-tests.guide+json;version=1alpha1',
  imageMetadata:
    'application/vnd.docs-tests.image-metadata+json;version=1alpha1',
  permissions: 'application/vnd.docs-tests.permissions+json;version=1alpha1',
} as const;

export type GuideAttachment = {
  metadata: GuideMetadata;
  schemaVersion: 'docs-tests.guide/v1alpha1';
};

export type PermissionsAttachment = {
  permissions: PermissionNote[];
  schemaVersion: 'docs-tests.permissions/v1alpha1';
};

export async function attachGuide(testInfo: TestInfo, metadata: GuideMetadata) {
  const attachment: GuideAttachment = {
    metadata: normalizeGuideMetadata(metadata),
    schemaVersion: 'docs-tests.guide/v1alpha1',
  };
  await testInfo.attach(DOCS_TESTS_ATTACHMENTS.guide, {
    body: JSON.stringify(attachment),
    contentType: DOCS_TESTS_CONTENT_TYPES.guide,
  });
}

export async function attachPermissionsEvent(
  testInfo: TestInfo,
  permissions: readonly (string | PermissionNote)[],
) {
  const attachment: PermissionsAttachment = {
    permissions: permissions.map(normalizePermissionNote),
    schemaVersion: 'docs-tests.permissions/v1alpha1',
  };
  await testInfo.attach(DOCS_TESTS_ATTACHMENTS.permissions, {
    body: JSON.stringify(attachment),
    contentType: DOCS_TESTS_CONTENT_TYPES.permissions,
  });
}
