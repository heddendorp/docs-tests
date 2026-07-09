import { expect, test } from '@playwright/test';
import type { Locator, Page, PageScreenshotOptions, TestInfo } from '@playwright/test';

import {
  DOCS_TESTS_ATTACHMENTS,
  DOCS_TESTS_CONTENT_TYPES,
} from '../../src/events.js';
import {
  DOCUMENTATION_IMAGE_METADATA_SCHEMA_VERSION,
  takeDocScreenshot,
  takeScreenshot,
  type DocumentationImageMetadata,
  type DocumentationScreenshotOptions,
} from '../../src/screenshot.js';

type RecordedAttachment = {
  body: string | Buffer | undefined;
  contentType: string | undefined;
  name: string;
};

const createTestInfo = () => {
  const attachments: RecordedAttachment[] = [];
  const testInfo = {
    attach: async (
      name: string,
      options?: { body?: string | Buffer; contentType?: string },
    ) => {
      attachments.push({
        body: options?.body,
        contentType: options?.contentType,
        name,
      });
    },
  } as unknown as TestInfo;

  return { attachments, testInfo };
};

const createLocator = () => {
  const element = {
    dataset: {} as Record<string, string | undefined>,
    scrollIntoView: () => undefined,
    style: {
      outline: '1px dotted black',
      zIndex: '7',
    },
  };
  let evaluateCount = 0;

  const locator = {
    evaluate: async (callback: (value: unknown) => unknown) => {
      evaluateCount += 1;
      return callback(element);
    },
    first: () => locator,
    locator: () => locator,
    waitFor: async () => undefined,
  } as unknown as Locator;

  return {
    element,
    evaluateCount: () => evaluateCount,
    locator,
  };
};

const createPage = (options?: { screenshotError?: Error }) => {
  const screenshotCalls: PageScreenshotOptions[] = [];
  const body = {
    waitFor: async () => undefined,
  } as unknown as Locator;
  const page = {
    evaluate: async () => undefined,
    locator: () => body,
    screenshot: async (screenshotOptions?: PageScreenshotOptions) => {
      screenshotCalls.push(screenshotOptions ?? {});
      if (options?.screenshotError) throw options.screenshotError;
      return Buffer.from('screenshot');
    },
  } as unknown as Page;

  return { page, screenshotCalls };
};

const parseMetadata = (attachment: RecordedAttachment) =>
  JSON.parse(
    Buffer.isBuffer(attachment.body)
      ? attachment.body.toString('utf8')
      : attachment.body ?? '',
  ) as DocumentationImageMetadata;

test('forwards supported page screenshot options and emits linked image metadata', async () => {
  const { attachments, testInfo } = createTestInfo();
  const { page, screenshotCalls } = createPage();
  const focus = createLocator();
  const nativeMask = createLocator();
  const structuredMask = createLocator();
  const redacted = createLocator();
  const unnamedRedaction = createLocator();

  await takeDocScreenshot(testInfo, page, focus.locator, {
    alt: 'Billing dialog with the email addresses hidden',
    animations: 'allow',
    caption: 'Choose the appropriate billing role.',
    caret: 'initial',
    fullPage: true,
    mask: [nativeMask.locator],
    maskColor: '#000000',
    masks: [{ locator: structuredMask.locator }],
    quality: 80,
    redactions: [
      { locator: redacted.locator, reason: 'Customer email address' },
      { locator: unnamedRedaction.locator },
    ],
    scale: 'css',
    style: '.clock { visibility: hidden; }',
    type: 'jpeg',
  });

  expect(screenshotCalls).toEqual([
    expect.objectContaining({
      animations: 'allow',
      caret: 'initial',
      fullPage: true,
      mask: [
        nativeMask.locator,
        structuredMask.locator,
        redacted.locator,
        unnamedRedaction.locator,
      ],
      maskColor: '#000000',
      quality: 80,
      scale: 'css',
      type: 'jpeg',
    }),
  ]);
  expect(screenshotCalls[0]?.style).toContain('.debug-toolbar');
  expect(screenshotCalls[0]?.style).toContain(
    '.clock { visibility: hidden; }',
  );

  expect(attachments).toHaveLength(2);
  const [image, metadataAttachment] = attachments;
  expect(image).toEqual(
    expect.objectContaining({
      contentType: 'image/jpeg',
      name: expect.stringMatching(/^docs-tests:image:[0-9a-f-]{36}$/),
    }),
  );
  expect(metadataAttachment).toEqual(
    expect.objectContaining({
      contentType: DOCS_TESTS_CONTENT_TYPES.imageMetadata,
      name: DOCS_TESTS_ATTACHMENTS.imageMetadata,
    }),
  );
  expect(parseMetadata(metadataAttachment!)).toEqual({
    alt: 'Billing dialog with the email addresses hidden',
    caption: 'Choose the appropriate billing role.',
    imageAttachmentName: image!.name,
    redactions: [{ reason: 'Customer email address' }, {}],
    schemaVersion: DOCUMENTATION_IMAGE_METADATA_SCHEMA_VERSION,
  });
});

test('preserves the legacy positional signatures while emitting the new event pair', async () => {
  const { attachments, testInfo } = createTestInfo();
  const { page, screenshotCalls } = createPage();
  const focus = createLocator();

  await takeScreenshot(testInfo, focus.locator, page, 'Dashboard overview');

  expect(screenshotCalls).toEqual([
    expect.objectContaining({
      animations: 'disabled',
    }),
  ]);
  expect(screenshotCalls[0]?.style).toContain('.tsqd-parent-container');
  expect(attachments[0]?.name).toMatch(/^docs-tests:image:[0-9a-f-]{36}$/);
  expect(parseMetadata(attachments[1]!)).toEqual({
    caption: 'Dashboard overview',
    imageAttachmentName: attachments[0]!.name,
    schemaVersion: DOCUMENTATION_IMAGE_METADATA_SCHEMA_VERSION,
  });
});

test('does not forward a runtime path and restores highlights when capture fails', async () => {
  const { attachments, testInfo } = createTestInfo();
  const { page, screenshotCalls } = createPage({
    screenshotError: new Error('capture failed'),
  });
  const focus = createLocator();
  const options = {
    path: '/tmp/should-not-be-written.png',
  } as unknown as DocumentationScreenshotOptions;

  await expect(
    takeDocScreenshot(testInfo, page, focus.locator, options),
  ).rejects.toThrow('capture failed');

  expect(screenshotCalls[0]).not.toHaveProperty('path');
  expect(attachments).toEqual([]);
  expect(focus.evaluateCount()).toBe(2);
  expect(focus.element.style).toEqual({
    outline: '1px dotted black',
    zIndex: '7',
  });
  expect(focus.element.dataset).toEqual({});
});

test('rejects conflicting alt text before attaching an ambiguous image event', async () => {
  const { attachments, testInfo } = createTestInfo();
  const { page, screenshotCalls } = createPage();
  const focus = createLocator();

  await expect(
    takeDocScreenshot(testInfo, page, focus.locator, {
      alt: 'Overview',
      caption: { alt: 'Different overview', text: 'Caption' },
    }),
  ).rejects.toThrow('Pass alt either in caption');

  expect(screenshotCalls).toEqual([]);
  expect(attachments).toEqual([]);
});
