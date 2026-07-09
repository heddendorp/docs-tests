import { randomUUID } from 'node:crypto';
import type {
  Locator,
  Page,
  PageScreenshotOptions,
  TestInfo,
} from '@playwright/test';

import {
  DOCS_TESTS_ATTACHMENTS,
  DOCS_TESTS_CONTENT_TYPES,
} from './events.js';
import { normalizeCaption, type Caption } from './schema.js';

const DEFAULT_SCREENSHOT_STYLE =
  '[data-testid="devtools"], .debug-toolbar, .tsqd-parent-container { display: none !important; }';

export const DOCUMENTATION_IMAGE_METADATA_SCHEMA_VERSION =
  'docs-tests.image-metadata/v1alpha1';

export type ScreenshotCaption = Caption;

export type ScreenshotMask = Locator | { locator: Locator };

export type ScreenshotRedaction = {
  locator: Locator;
  reason?: string;
};

export type DocumentationImageMetadata = {
  alt?: string;
  caption?: string;
  imageAttachmentName: string;
  redactions?: Array<{ reason?: string }>;
  schemaVersion: typeof DOCUMENTATION_IMAGE_METADATA_SCHEMA_VERSION;
};

/**
 * Page screenshot options that keep file naming under docs-tests control.
 * `masks` and `redactions` are merged into Playwright's native `mask` option.
 */
export type DocumentationScreenshotOptions = Omit<
  PageScreenshotOptions,
  'mask' | 'path'
> & {
  alt?: string;
  caption?: string | ScreenshotCaption;
  /** Playwright-compatible mask locators. */
  mask?: readonly Locator[];
  /** Alias for mask with a structured form for future extension. */
  masks?: readonly ScreenshotMask[];
  /** Mask locators and retain only their optional reasons in image metadata. */
  redactions?: readonly ScreenshotRedaction[];
};

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

const normalizeMask = (mask: ScreenshotMask): Locator =>
  typeof (mask as Locator).locator === 'function'
    ? (mask as Locator)
    : (mask as { locator: Locator }).locator;

const resolveCaption = (
  caption: string | ScreenshotCaption | undefined,
  alt: string | undefined,
) => {
  const normalizedAlt = alt?.trim();
  if (typeof caption === 'string') {
    if (!caption.trim()) return { alt: normalizedAlt, caption: undefined };
    const normalizedCaption = normalizeCaption(caption);
    return { alt: normalizedAlt, caption: normalizedCaption.text };
  }
  if (!caption) return { alt: normalizedAlt, caption: undefined };

  const normalizedCaption = normalizeCaption(caption);

  if (
    normalizedCaption.alt &&
    normalizedAlt &&
    normalizedCaption.alt !== normalizedAlt
  ) {
    throw new Error(
      'Pass alt either in caption or as a screenshot option, not both with different values.',
    );
  }

  return {
    alt: normalizedAlt ?? normalizedCaption.alt,
    caption: normalizedCaption.text,
  };
};

const combineStyles = (style: string | undefined) =>
  style ? `${DEFAULT_SCREENSHOT_STYLE}\n${style}` : DEFAULT_SCREENSHOT_STYLE;

const normalizeScreenshotOptions = (
  captionOrOptions: string | DocumentationScreenshotOptions | undefined,
) => {
  if (typeof captionOrOptions === 'string' || captionOrOptions === undefined) {
    return {
      metadata: resolveCaption(captionOrOptions, undefined),
      screenshotOptions: {
        animations: 'disabled' as const,
        style: DEFAULT_SCREENSHOT_STYLE,
      },
    };
  }

  // Ignore a runtime-only `path` value so docs-tests owns attachment output.
  const {
    alt,
    caption,
    mask,
    masks,
    path: _path,
    redactions,
    style,
    ...pageScreenshotOptions
  } = captionOrOptions as DocumentationScreenshotOptions &
    Pick<PageScreenshotOptions, 'path'>;
  const combinedMasks = [
    ...(mask ?? []),
    ...(masks ?? []).map(normalizeMask),
    ...(redactions ?? []).map(({ locator }) => locator),
  ];

  return {
    metadata: {
      ...resolveCaption(caption, alt),
      redactions:
        redactions && redactions.length > 0
          ? redactions.map(({ reason }) => {
              const normalizedReason = reason?.trim();
              return normalizedReason ? { reason: normalizedReason } : {};
            })
          : undefined,
    },
    screenshotOptions: {
      ...pageScreenshotOptions,
      animations: pageScreenshotOptions.animations ?? 'disabled',
      ...(combinedMasks.length > 0 ? { mask: combinedMasks } : {}),
      style: combineStyles(style),
    } satisfies PageScreenshotOptions,
  };
};

const imageContentType = (options: PageScreenshotOptions) =>
  options.type === 'jpeg' ? 'image/jpeg' : 'image/png';

export function takeDocScreenshot(
  testInfo: TestInfo,
  page: Page,
  locators: Locator | Locator[],
  caption?: string,
): Promise<void>;
export function takeDocScreenshot(
  testInfo: TestInfo,
  page: Page,
  locators: Locator | Locator[],
  options?: DocumentationScreenshotOptions,
): Promise<void>;
export async function takeDocScreenshot(
  testInfo: TestInfo,
  page: Page,
  locators: Locator | Locator[],
  captionOrOptions?: string | DocumentationScreenshotOptions,
): Promise<void> {
  await settleRenderFrame(page);
  const focusPoints = Array.isArray(locators) ? locators : [locators];
  const highlightedLocators: Locator[] = [];

  try {
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
      highlightedLocators.push(locator);
    }

    const { metadata, screenshotOptions } = normalizeScreenshotOptions(
      captionOrOptions,
    );
    const imageAttachmentName = `${DOCS_TESTS_ATTACHMENTS.imagePrefix}${randomUUID()}`;
    const image = await page.screenshot(screenshotOptions);

    await testInfo.attach(imageAttachmentName, {
      body: image,
      contentType: imageContentType(screenshotOptions),
    });
    await testInfo.attach(DOCS_TESTS_ATTACHMENTS.imageMetadata, {
      body: Buffer.from(
        JSON.stringify({
          ...metadata,
          imageAttachmentName,
          schemaVersion: DOCUMENTATION_IMAGE_METADATA_SCHEMA_VERSION,
        } satisfies DocumentationImageMetadata),
      ),
      contentType: DOCS_TESTS_CONTENT_TYPES.imageMetadata,
    });
  } finally {
    for (const locator of highlightedLocators) {
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
}

export function takeScreenshot(
  testInfo: TestInfo,
  locators: Locator | Locator[],
  page: Page,
  caption?: string,
): Promise<void>;
export function takeScreenshot(
  testInfo: TestInfo,
  locators: Locator | Locator[],
  page: Page,
  options?: DocumentationScreenshotOptions,
): Promise<void>;
export function takeScreenshot(
  testInfo: TestInfo,
  locators: Locator | Locator[],
  page: Page,
  captionOrOptions?: string | DocumentationScreenshotOptions,
) {
  if (typeof captionOrOptions === 'string' || captionOrOptions === undefined)
    return takeDocScreenshot(testInfo, page, locators, captionOrOptions);

  return takeDocScreenshot(testInfo, page, locators, captionOrOptions);
}
