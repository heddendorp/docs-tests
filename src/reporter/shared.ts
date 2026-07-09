import fs from 'node:fs';
import path from 'node:path';

import { DOCS_TESTS_ATTACHMENTS } from '../events.js';
import type { GuideMetadata, PermissionNote } from '../schema.js';

export const DOCUMENTATION_ATTACHMENT_NAMES = new Set([
  'image',
  'image-caption',
  'markdown',
  'permissions',
  DOCS_TESTS_ATTACHMENTS.guide,
  DOCS_TESTS_ATTACHMENTS.imageMetadata,
  DOCS_TESTS_ATTACHMENTS.markdown,
  DOCS_TESTS_ATTACHMENTS.permissions,
]);

export const DOCS_TESTS_OUTPUT_MANIFEST_FILE = '.docs-tests-manifest.json';
export const DOCS_TESTS_BUNDLE_FILE = 'docs-tests.bundle.json';

export const MAX_FOLDER_NAME_LENGTH = 64;

export type TestSection = {
  blocks: DocumentationBlock[];
  guide?: GuideMetadata;
  line: number;
  source: SourceTestReference;
  title: string;
};

export type SourceTestReference = {
  file?: string;
  line?: number;
  titlePath?: string[];
};

export type DocumentationBlock =
  | { markdown: string; type: 'markdown' }
  | { permissions: PermissionNote[]; type: 'permissions' }
  | {
      alt: string;
      asset: DocumentationAsset;
      caption?: string;
      redactions?: readonly { reason?: string }[];
      type: 'image';
    };

export type DocumentationAsset = {
  id: string;
  integrity: string;
  mediaType: string;
  outputPath: string;
};

export type TestGroupDocument = {
  describeTitle?: string;
  filePath?: string;
  folderName: string;
  guide?: GuideMetadata;
  sections: TestSection[];
};

export type TestGroupInfo = {
  describeTitle?: string;
  filePath?: string;
  folderName: string;
  groupKey: string;
};

export function isDocumentationAttachmentName(name: string) {
  return (
    DOCUMENTATION_ATTACHMENT_NAMES.has(name) ||
    name.startsWith(DOCS_TESTS_ATTACHMENTS.imagePrefix)
  );
}

export function readDocumentationEnvironment() {
  const docsOutputDirectory = path.resolve(
    process.env['DOCS_OUT_DIR'] ?? 'generated-docs',
  );
  const docsImageOutputDirectory = path.resolve(
    process.env['DOCS_IMG_OUT_DIR'] ?? docsOutputDirectory,
  );
  const imagePublicPath = process.env['DOCS_IMAGE_PUBLIC_PATH']?.trim();

  return {
    docsImageOutputDirectory,
    docsOutputDirectory,
    imagePublicPath: imagePublicPath ? imagePublicPath : undefined,
  };
}

export function ensureDirectory(
  directoryPath: string,
  options?: { empty?: boolean },
) {
  if (options?.empty && fs.existsSync(directoryPath)) {
    fs.rmSync(directoryPath, { force: true, recursive: true });
  }
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

export function writeFile(filePath: string, content: Buffer | string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function stripTagsFromTitle(title: string) {
  return title
    .replace(/(^|\s)@[a-z0-9_-]+(?:\([^)]*\))?(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyTestTitle(title: string) {
  return (
    stripTagsFromTitle(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') || 'test'
  );
}

export function slugifyFolderNameFromTitle(title: string) {
  return (
    slugifyTestTitle(title)
      .slice(0, MAX_FOLDER_NAME_LENGTH)
      .replace(/-+$/g, '') || 'docs'
  );
}

export function titleFromTestFile(filePath: string) {
  const baseName = path
    .basename(filePath)
    .replace(/\.(doc|spec|test)\.ts$/i, '')
    .trim();
  if (!baseName) return 'Documentation';

  return baseName
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ');
}

export function findFileSegmentIndex(titlePath: string[]) {
  return titlePath.findIndex(
    (segment) =>
      segment.includes('/') ||
      segment.includes('\\') ||
      /\.(doc|spec|test)\.ts$/i.test(segment),
  );
}
