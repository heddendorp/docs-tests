import type { TestCase, TestResult } from '@playwright/test/reporter';
import crypto from 'node:crypto';
import path from 'node:path';

import { writeFile } from './shared.js';

type ResultAttachment = TestResult['attachments'][number];

const readAttachmentBody = (
  attachment: ResultAttachment,
  testTitle: string,
): Buffer | undefined => {
  if (!attachment.body) {
    console.warn(`Missing body for "${attachment.name}" in "${testTitle}"`);
    return undefined;
  }
  return attachment.body;
};

const parseMarkdownAttachment = (markdown: string) => {
  const match = markdown.match(/^---[\s\S]*?---\s*/);
  if (!match) return { body: markdown, permissions: [] as string[] };

  const permissions = match[0]
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*(.+)$/)?.[1])
    .filter((line): line is string => Boolean(line));

  return { body: markdown.slice(match[0].length), permissions };
};

const collectPermissionLines = (
  attachments: readonly ResultAttachment[],
  testTitle: string,
) => {
  const body = attachments
    .filter((attachment) => attachment.name === 'permissions')
    .map((attachment) => readAttachmentBody(attachment, testTitle)?.toString())
    .filter((value): value is string => Boolean(value))
    .join('\n');

  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const appendPermissions = (
  content: string[],
  permissions: readonly string[],
) => {
  if (permissions.length === 0) return;

  content.push(
    '{% callout type="note" title="User permissions" %}',
    ...permissions.map((permission) => `- ${permission}`),
    '{% /callout %}',
    '',
  );
};

const buildImageReference = (input: {
  folderName: string;
  imageName: string;
  imagePublicPath?: string;
}) => {
  if (!input.imagePublicPath) return `./${input.imageName}`;

  const base = input.imagePublicPath.replace(/\/+$/g, '');
  return `${base}/${input.folderName}/${input.imageName}`;
};

export function buildSectionContent(input: {
  attachments: readonly ResultAttachment[];
  folderName: string;
  imageDirectory: string;
  imagePublicPath?: string;
  test: TestCase;
}) {
  const content: string[] = [];
  const permissionLines = collectPermissionLines(
    input.attachments,
    input.test.title,
  );

  for (const attachment of input.attachments) {
    if (attachment.name === 'permissions') continue;

    if (attachment.name === 'markdown') {
      const body = readAttachmentBody(attachment, input.test.title);
      if (!body) continue;

      const parsed = parseMarkdownAttachment(body.toString());
      permissionLines.push(...parsed.permissions);
      appendPermissions(content, permissionLines);
      content.push(parsed.body.trim(), '');
      continue;
    }

    if (attachment.name === 'image') {
      const body = readAttachmentBody(attachment, input.test.title);
      if (!body) continue;

      const hash = crypto.createHash('sha256').update(body).digest('hex');
      const extension = attachment.contentType.split('/')[1] || 'png';
      const imageName = `image-${hash.slice(0, 16)}.${extension}`;
      writeFile(path.join(input.imageDirectory, imageName), body);
      content.push(
        `![Documentation screenshot](${buildImageReference({
          folderName: input.folderName,
          imageName,
          imagePublicPath: input.imagePublicPath,
        })})`,
      );
      continue;
    }

    if (attachment.name === 'image-caption') {
      const body = readAttachmentBody(attachment, input.test.title);
      const last = content.at(-1) ?? '';
      if (!body || !last.startsWith('![')) continue;

      const imageUrl = last.split('(')[1]?.split(')')[0] ?? '';
      content[content.length - 1] =
        `{% figure src="${imageUrl}" caption="${body.toString()}" /%}`;
    }
  }

  return content.map((line) => line.trimEnd());
}
