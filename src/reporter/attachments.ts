import type { TestCase, TestResult } from '@playwright/test/reporter';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  DOCS_TESTS_ATTACHMENTS,
  type GuideAttachment,
  type PermissionsAttachment,
} from '../events.js';
import {
  canonicalJson,
  normalizeCaption,
  normalizeGuideMetadata,
  normalizePermissionNote,
  type Caption,
  type GuideMetadata,
  type PermissionNote,
} from '../schema.js';
import {
  type DocumentationAsset,
  type DocumentationBlock,
  writeFile,
} from './shared.js';

type ResultAttachment = TestResult['attachments'][number];

type ImageMetadata = {
  alt?: string;
  caption?: string | Caption;
  imageAttachmentName: string;
  redactions?: readonly { reason?: string }[];
  schemaVersion: 'docs-tests.image-metadata/v1alpha1';
};

type ParsedImageMetadata = Omit<ImageMetadata, 'caption' | 'redactions'> & {
  caption?: Caption;
  redactions?: Array<{ reason?: string }>;
};

export type BuiltSectionContent = {
  blocks: DocumentationBlock[];
  guide?: GuideMetadata;
};

const IMAGE_EXTENSIONS = new Map([
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const readAttachmentBody = (
  attachment: ResultAttachment,
  testTitle: string,
): Buffer => {
  if (attachment.body) return attachment.body;
  if (attachment.path) {
    try {
      return fs.readFileSync(attachment.path);
    } catch (error) {
      throw new Error(
        `Unable to read attachment path for "${attachment.name}" in "${testTitle}".`,
        { cause: error },
      );
    }
  }

  throw new Error(
    `Documentation attachment "${attachment.name}" in "${testTitle}" has no body or path.`,
  );
};

const readJsonAttachment = <T>(
  attachment: ResultAttachment,
  testTitle: string,
  label: string,
): T => {
  try {
    return JSON.parse(readAttachmentBody(attachment, testTitle).toString()) as T;
  } catch (error) {
    throw new Error(
      `Invalid ${label} attachment in "${testTitle}".`,
      { cause: error },
    );
  }
};

const getImageExtension = (contentType: string | undefined, testTitle: string) => {
  const normalizedContentType = contentType?.toLowerCase() ?? '';
  const extension = IMAGE_EXTENSIONS.get(normalizedContentType);
  if (!extension)
    throw new Error(
      `Unsupported documentation image content type "${contentType ?? 'unknown'}" in "${testTitle}".`,
    );
  return extension;
};

const parsePermissionsAttachment = (
  attachment: ResultAttachment,
  testTitle: string,
): PermissionNote[] => {
  if (attachment.name === 'permissions') {
    return readAttachmentBody(attachment, testTitle)
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(normalizePermissionNote);
  }

  const value = readJsonAttachment<PermissionsAttachment>(
    attachment,
    testTitle,
    'permissions',
  );
  if (
    value.schemaVersion !== 'docs-tests.permissions/v1alpha1' ||
    !Array.isArray(value.permissions)
  )
    throw new Error(`Invalid permissions attachment in "${testTitle}".`);
  return value.permissions.map(normalizePermissionNote);
};

export const getGuideMetadata = (
  attachments: readonly ResultAttachment[],
  testTitle: string,
) => {
  const guides = attachments
    .filter((attachment) => attachment.name === DOCS_TESTS_ATTACHMENTS.guide)
    .map((attachment) => {
      const value = readJsonAttachment<GuideAttachment>(
        attachment,
        testTitle,
        'guide metadata',
      );
      if (value.schemaVersion !== 'docs-tests.guide/v1alpha1')
        throw new Error(`Invalid guide metadata attachment in "${testTitle}".`);
      return normalizeGuideMetadata(value.metadata);
    });

  if (guides.length === 0) return undefined;
  const fingerprint = canonicalJson(guides[0]);
  if (guides.some((guide) => canonicalJson(guide) !== fingerprint))
    throw new Error(`Conflicting guide metadata attachments in "${testTitle}".`);
  return guides[0];
};

const parseImageMetadata = (
  attachments: readonly ResultAttachment[],
  testTitle: string,
) => {
  const metadata = new Map<string, ParsedImageMetadata>();
  for (const attachment of attachments) {
    if (attachment.name !== DOCS_TESTS_ATTACHMENTS.imageMetadata) continue;

    const value = readJsonAttachment<ImageMetadata>(
      attachment,
      testTitle,
      'image metadata',
    );
    if (
      value.schemaVersion !== 'docs-tests.image-metadata/v1alpha1' ||
      typeof value.imageAttachmentName !== 'string' ||
      !value.imageAttachmentName.startsWith(DOCS_TESTS_ATTACHMENTS.imagePrefix)
    )
      throw new Error(`Invalid image metadata attachment in "${testTitle}".`);
    if (metadata.has(value.imageAttachmentName))
      throw new Error(
        `Duplicate image metadata for "${value.imageAttachmentName}" in "${testTitle}".`,
      );

    const caption = value.caption ? normalizeCaption(value.caption) : undefined;
    if (value.alt !== undefined && typeof value.alt !== 'string')
      throw new Error(`Invalid image metadata attachment in "${testTitle}".`);
    if (
      value.redactions !== undefined &&
      (!Array.isArray(value.redactions) ||
        value.redactions.some(
          (redaction) =>
            !redaction ||
            typeof redaction !== 'object' ||
            ('reason' in redaction &&
              redaction.reason !== undefined &&
              typeof redaction.reason !== 'string'),
        ))
    )
      throw new Error(`Invalid image metadata attachment in "${testTitle}".`);
    const alt = value.alt?.trim();
    const redactions = value.redactions?.map(({ reason }) => {
      const normalizedReason = reason?.trim();
      return normalizedReason ? { reason: normalizedReason } : {};
    });
    metadata.set(value.imageAttachmentName, {
      ...(alt ? { alt } : {}),
      ...(caption ? { caption } : {}),
      imageAttachmentName: value.imageAttachmentName,
      ...(redactions?.length ? { redactions } : {}),
      schemaVersion: 'docs-tests.image-metadata/v1alpha1',
    });
  }
  return metadata;
};

const updatePreviousImageCaption = (
  blocks: DocumentationBlock[],
  caption: Caption,
) => {
  const last = blocks.at(-1);
  if (!last || last.type !== 'image') return;
  last.caption = caption.text;
  if (caption.alt) last.alt = caption.alt;
};

export function buildSectionContent(input: {
  attachments: readonly ResultAttachment[];
  folderName: string;
  guide?: GuideMetadata;
  imageDirectory: string;
  imagePublicPath?: string;
  test: TestCase;
}): BuiltSectionContent {
  const blocks: DocumentationBlock[] = [];
  const imageMetadata = parseImageMetadata(input.attachments, input.test.title);
  const consumedImageMetadata = new Set<string>();
  const guide = input.guide ?? getGuideMetadata(input.attachments, input.test.title);

  for (const attachment of input.attachments) {
    if (
      attachment.name === DOCS_TESTS_ATTACHMENTS.guide ||
      attachment.name === DOCS_TESTS_ATTACHMENTS.imageMetadata
    )
      continue;

    if (
      attachment.name === 'permissions' ||
      attachment.name === DOCS_TESTS_ATTACHMENTS.permissions
    ) {
      const permissions = parsePermissionsAttachment(attachment, input.test.title);
      if (permissions.length > 0) blocks.push({ permissions, type: 'permissions' });
      continue;
    }

    if (
      attachment.name === 'markdown' ||
      attachment.name === DOCS_TESTS_ATTACHMENTS.markdown
    ) {
      const markdown = readAttachmentBody(attachment, input.test.title)
        .toString()
        .trim();
      if (markdown) blocks.push({ markdown, type: 'markdown' });
      continue;
    }

    if (
      attachment.name === 'image' ||
      attachment.name.startsWith(DOCS_TESTS_ATTACHMENTS.imagePrefix)
    ) {
      const body = readAttachmentBody(attachment, input.test.title);
      const hash = crypto.createHash('sha256').update(body).digest('hex');
      const extension = getImageExtension(attachment.contentType, input.test.title);
      const imageName = `image-${hash.slice(0, 16)}.${extension}`;
      const outputPath = `${input.folderName}/${imageName}`;
      const asset: DocumentationAsset = {
        id: `asset:${outputPath}`,
        integrity: `sha256-${hash}`,
        mediaType: attachment.contentType!.toLowerCase(),
        outputPath,
      };
      writeFile(path.join(input.imageDirectory, imageName), body);

      const metadata = imageMetadata.get(attachment.name);
      if (metadata) consumedImageMetadata.add(attachment.name);
      blocks.push({
        alt: metadata?.alt ?? 'Documentation screenshot',
        asset,
        ...(metadata?.caption ? { caption: metadata.caption.text } : {}),
        ...(metadata?.redactions ? { redactions: metadata.redactions } : {}),
        type: 'image',
      });
      continue;
    }

    if (attachment.name === 'image-caption') {
      const caption = normalizeCaption(
        readAttachmentBody(attachment, input.test.title).toString(),
      );
      updatePreviousImageCaption(blocks, caption);
    }
  }

  for (const imageAttachmentName of imageMetadata.keys()) {
    if (!consumedImageMetadata.has(imageAttachmentName))
      throw new Error(
        `Image metadata references a missing documentation image in "${input.test.title}".`,
      );
  }

  return { blocks, ...(guide ? { guide } : {}) };
}
