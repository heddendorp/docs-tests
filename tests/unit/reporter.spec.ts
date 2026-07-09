import { expect, test } from '@playwright/test';
import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';

import {
  DOCS_TESTS_ATTACHMENTS,
  DOCS_TESTS_CONTENT_TYPES,
} from '../../src/events.js';
import DocumentationReporter from '../../src/reporter.js';
import type { GuideMetadata } from '../../src/schema.js';

type OutputDirectories = {
  docs: string;
  images: string;
};

const emptySuite = { allTests: () => [] } as unknown as Suite;

const createTestCase = (
  title = 'First guide step',
  id = title,
  options: {
    file?: string;
    line?: number;
    titlePath?: string[];
  } = {},
) =>
  ({
    id,
    location: {
      file: options.file ?? '/tmp/getting-started.doc.ts',
      line: options.line ?? 10,
    },
    title,
    titlePath: () =>
      options.titlePath ?? [
        '',
        '/tmp/getting-started.doc.ts',
        'Getting started',
        title,
      ],
  }) as unknown as TestCase;

const createResult = (
  status: TestResult['status'],
  attachments: TestResult['attachments'],
) => ({ attachments, status }) as unknown as TestResult;

const successfulRun = { status: 'passed' } as unknown as FullResult;

const setOutputDirectories = (directories: OutputDirectories) => {
  const previous = {
    docs: process.env['DOCS_OUT_DIR'],
    imagePublicPath: process.env['DOCS_IMAGE_PUBLIC_PATH'],
    images: process.env['DOCS_IMG_OUT_DIR'],
  };
  process.env['DOCS_OUT_DIR'] = directories.docs;
  process.env['DOCS_IMG_OUT_DIR'] = directories.images;
  delete process.env['DOCS_IMAGE_PUBLIC_PATH'];

  return () => {
    if (previous.docs === undefined) delete process.env['DOCS_OUT_DIR'];
    else process.env['DOCS_OUT_DIR'] = previous.docs;

    if (previous.images === undefined) delete process.env['DOCS_IMG_OUT_DIR'];
    else process.env['DOCS_IMG_OUT_DIR'] = previous.images;

    if (previous.imagePublicPath === undefined)
      delete process.env['DOCS_IMAGE_PUBLIC_PATH'];
    else process.env['DOCS_IMAGE_PUBLIC_PATH'] = previous.imagePublicPath;
  };
};

const startReporter = (
  reporter: DocumentationReporter,
  config: Partial<FullConfig> = {},
) => {
  reporter.onBegin(config as FullConfig, emptySuite);
};

const markdownAttachment = (body = 'Verified guide content') =>
  ({
    body: Buffer.from(body),
    contentType: 'text/markdown',
    name: 'markdown',
  }) as unknown as TestResult['attachments'][number];

const imageAttachment = (body = Buffer.from([137, 80, 78, 71])) =>
  ({
    body,
    contentType: 'image/png',
    name: 'image',
  }) as unknown as TestResult['attachments'][number];

const guideAttachment = (metadata: GuideMetadata) =>
  ({
    body: Buffer.from(
      JSON.stringify({
        metadata,
        schemaVersion: 'docs-tests.guide/v1alpha1',
      }),
    ),
    contentType: DOCS_TESTS_CONTENT_TYPES.guide,
    name: DOCS_TESTS_ATTACHMENTS.guide,
  }) as unknown as TestResult['attachments'][number];

const permissionsAttachment = (permissions: unknown[]) =>
  ({
    body: Buffer.from(
      JSON.stringify({
        permissions,
        schemaVersion: 'docs-tests.permissions/v1alpha1',
      }),
    ),
    contentType: DOCS_TESTS_CONTENT_TYPES.permissions,
    name: DOCS_TESTS_ATTACHMENTS.permissions,
  }) as unknown as TestResult['attachments'][number];

const namespacedImageAttachment = (
  name: string,
  body = Buffer.from([137, 80, 78, 71]),
) =>
  ({
    body,
    contentType: 'image/png',
    name,
  }) as unknown as TestResult['attachments'][number];

const imageMetadataAttachment = (input: {
  alt?: string;
  caption?: string;
  imageAttachmentName: string;
  redactions?: Array<{ reason?: string }>;
}) =>
  ({
    body: Buffer.from(
      JSON.stringify({
        ...input,
        schemaVersion: 'docs-tests.image-metadata/v1alpha1',
      }),
    ),
    contentType: DOCS_TESTS_CONTENT_TYPES.imageMetadata,
    name: DOCS_TESTS_ATTACHMENTS.imageMetadata,
  }) as unknown as TestResult['attachments'][number];

test('publishes staged docs only after a fully passing run', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const staleDoc = path.join(directories.docs, 'manual', 'page.md');
    fs.mkdirSync(path.dirname(staleDoc), { recursive: true });
    fs.writeFileSync(staleDoc, 'hand-authored guide');

    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment(), imageAttachment()]),
    );

    expect(fs.readFileSync(staleDoc, 'utf8')).toBe('hand-authored guide');
    expect(
      fs.existsSync(path.join(directories.docs, 'getting-started', 'page.md')),
    ).toBe(false);

    await reporter.onEnd(successfulRun);

    const page = fs.readFileSync(
      path.join(directories.docs, 'getting-started', 'page.md'),
      'utf8',
    );
    expect(page).toContain('title: "Getting started"');
    expect(page).toContain('Verified guide content');
    expect(fs.readFileSync(staleDoc, 'utf8')).toBe('hand-authored guide');
    expect(
      fs.readdirSync(path.join(directories.images, 'getting-started')),
    ).toHaveLength(1);
  } finally {
    restore();
  }
});

test('leaves existing outputs untouched when the Playwright run fails', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const existingPage = path.join(directories.docs, 'getting-started', 'page.md');
    fs.mkdirSync(path.dirname(existingPage), { recursive: true });
    fs.writeFileSync(existingPage, 'previous verified output');

    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment('new output')]),
    );
    await reporter.onEnd({ status: 'failed' } as FullResult);

    expect(fs.readFileSync(existingPage, 'utf8')).toBe('previous verified output');
    expect(fs.existsSync(directories.images)).toBe(false);
  } finally {
    restore();
  }
});

test('ignores failed test attempts even when the run eventually passes', async ({}, testInfo) => {
  const restore = setOutputDirectories({
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  });

  try {
    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('failed', [markdownAttachment('failed attempt')]),
    );
    await reporter.onEnd(successfulRun);

    expect(fs.existsSync(testInfo.outputPath('docs'))).toBe(false);
  } finally {
    restore();
  }
});

test('deduplicates identical documentation from the same source across projects', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase('Open dashboard', 'chromium-id'),
      createResult('passed', [markdownAttachment('Shared guide')]),
    );
    reporter.onTestEnd(
      createTestCase('Open dashboard', 'firefox-id'),
      createResult('passed', [markdownAttachment('Shared guide')]),
    );
    await reporter.onEnd(successfulRun);

    const page = fs.readFileSync(
      path.join(directories.docs, 'getting-started', 'page.md'),
      'utf8',
    );
    expect(page).toContain('Shared guide');
    expect(page.match(/Shared guide/g)).toHaveLength(1);
  } finally {
    restore();
  }
});

test('reads Playwright path attachments', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const sourceImage = testInfo.outputPath('source.png');
    const image = Buffer.from([137, 80, 78, 71]);
    fs.writeFileSync(sourceImage, image);

    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [
        markdownAttachment(),
        {
          contentType: 'image/png',
          name: 'image',
          path: sourceImage,
        } as unknown as TestResult['attachments'][number],
      ]),
    );
    await reporter.onEnd(successfulRun);

    const imageDirectory = path.join(directories.images, 'getting-started');
    const imageName = fs.readdirSync(imageDirectory).at(0);
    expect(imageName).toBeDefined();
    expect(fs.readFileSync(path.join(imageDirectory, imageName!))).toEqual(image);
  } finally {
    restore();
  }
});

test('manifest-owned clean removes only previously generated files', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const firstReporter = new DocumentationReporter();
    startReporter(firstReporter);
    firstReporter.onTestEnd(
      createTestCase('Document the old surface', 'old-guide', {
        titlePath: ['', '/tmp/old.doc.ts', 'Old guide', 'Document the old surface'],
      }),
      createResult('passed', [markdownAttachment('Old generated content'), imageAttachment()]),
    );
    await firstReporter.onEnd(successfulRun);

    const oldPage = path.join(directories.docs, 'old-guide', 'page.md');
    const oldImage = fs.readdirSync(path.join(directories.images, 'old-guide'))[0]!;
    const manualDoc = path.join(directories.docs, 'manual', 'notes.md');
    const manualImage = path.join(directories.images, 'manual', 'logo.png');
    fs.mkdirSync(path.dirname(manualDoc), { recursive: true });
    fs.mkdirSync(path.dirname(manualImage), { recursive: true });
    fs.writeFileSync(manualDoc, 'hand-authored guide');
    fs.writeFileSync(manualImage, 'hand-authored image');

    const reporter = new DocumentationReporter({
      clean: 'manifest-owned',
      fullRun: true,
    });
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase('Document the new surface', 'new-guide', {
        titlePath: ['', '/tmp/new.doc.ts', 'New guide', 'Document the new surface'],
      }),
      createResult('passed', [markdownAttachment('New generated content'), imageAttachment(Buffer.from('new image'))]),
    );
    await reporter.onEnd(successfulRun);

    expect(fs.existsSync(oldPage)).toBe(false);
    expect(fs.existsSync(path.join(directories.images, 'old-guide', oldImage))).toBe(false);
    expect(fs.readFileSync(manualDoc, 'utf8')).toBe('hand-authored guide');
    expect(fs.readFileSync(manualImage, 'utf8')).toBe('hand-authored image');
    expect(
      fs.existsSync(path.join(directories.docs, 'new-guide', 'page.md')),
    ).toBe(true);
  } finally {
    restore();
  }
});

test('renders explicit guide metadata as portable Markdown and a versioned bundle', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const imageName = 'docs-tests:image:billing-overview';
    const documentedTest = createTestCase(
      'Explain the billing overview',
      'billing-overview',
    );
    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      documentedTest,
      createResult('passed', [
        guideAttachment({
          frontmatter: { audience: 'administrators', draft: false },
          id: 'billing-overview',
          order: 2,
          permissions: [{ description: 'Can review invoices.', label: 'Billing' }],
          slug: 'guides/billing/overview',
          tags: ['billing', 'finance'],
          title: 'Manage billing',
        }),
        {
          body: Buffer.from('---\nkeep: this-frontmatter\n---\n\nReview the billing overview.'),
          contentType: 'text/markdown',
          name: DOCS_TESTS_ATTACHMENTS.markdown,
        } as unknown as TestResult['attachments'][number],
        permissionsAttachment([{ label: 'Invoices', required: true }]),
        namespacedImageAttachment(imageName),
        imageMetadataAttachment({
          alt: 'Billing overview with customer email addresses hidden',
          caption: 'Review *all* invoices before exporting.',
          imageAttachmentName: imageName,
          redactions: [{ reason: 'Customer email address' }],
        }),
      ]),
    );
    await reporter.onEnd(successfulRun);

    const page = fs.readFileSync(
      path.join(directories.docs, 'guides', 'billing', 'overview', 'page.md'),
      'utf8',
    );
    expect(page).toContain('title: "Manage billing"');
    expect(page).toContain('keep: this-frontmatter');
    expect(page).toContain('> **Required permissions**');
    expect(page).toContain('> - Billing: Can review invoices.');
    expect(page).toContain('> - Invoices');
    expect(page).toContain(
      '![Billing overview with customer email addresses hidden](./image-',
    );
    expect(page).toContain('*Review \\*all\\* invoices before exporting.*');
    expect(page).not.toContain('{%');

    expect(
      fs.readdirSync(
        path.join(directories.images, 'guides', 'billing', 'overview'),
      ),
    ).toHaveLength(1);

    const bundle = JSON.parse(
      fs.readFileSync(
        path.join(directories.docs, 'docs-tests.bundle.json'),
        'utf8',
      ),
    ) as {
      assets: Array<{ outputPath: string }>;
      guides: Array<{
        id: string;
        metadata: { frontmatter?: Record<string, unknown>; tags?: string[] };
        sections: Array<{
          blocks: Array<{ redactions?: Array<{ reason?: string }> }>;
          source: { file?: string; titlePath?: string[] };
        }>;
        slug: string;
      }>;
      schemaVersion: string;
    };
    expect(bundle.schemaVersion).toBe('docs-tests.bundle/v1alpha1');
    expect(bundle.guides).toHaveLength(1);
    expect(bundle.guides[0]).toMatchObject({
      id: 'billing-overview',
      metadata: {
        frontmatter: { audience: 'administrators', draft: false },
        tags: ['billing', 'finance'],
      },
      slug: 'guides/billing/overview',
    });
    expect(bundle.guides[0]!.sections[0]!.source.file).toBeUndefined();
    expect(bundle.guides[0]!.sections[0]!.source.titlePath).not.toContain(
      '/tmp/getting-started.doc.ts',
    );
    expect(bundle.guides[0]!.sections[0]!.blocks.at(-1)?.redactions).toEqual([
      { reason: 'Customer email address' },
    ]);
    expect(bundle.assets[0]!.outputPath).toMatch(
      /^guides\/billing\/overview\/image-[a-f0-9]{16}\.png$/,
    );
  } finally {
    restore();
  }
});

test('fails instead of choosing whichever project produces conflicting documentation first', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const preservedPage = path.join(directories.docs, 'manual', 'page.md');
    fs.mkdirSync(path.dirname(preservedPage), { recursive: true });
    fs.writeFileSync(preservedPage, 'verified output');

    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase('Open dashboard', 'chromium-id'),
      createResult('passed', [markdownAttachment('Chromium-specific guide')]),
    );
    reporter.onTestEnd(
      createTestCase('Open dashboard', 'firefox-id'),
      createResult('passed', [markdownAttachment('Firefox-specific guide')]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.readFileSync(preservedPage, 'utf8')).toBe('verified output');
    expect(fs.existsSync(path.join(directories.docs, 'getting-started'))).toBe(
      false,
    );
  } finally {
    restore();
  }
});

test('uses an explicit slug without creating a legacy fallback', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const documentedTest = createTestCase('Document the guide', 'guide-id');
    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      documentedTest,
      createResult('passed', [
        guideAttachment({
          id: 'guide-id',
          slug: 'getting-started',
          title: 'Stable guide',
        }),
        markdownAttachment('Explicit guide content'),
      ]),
    );
    await reporter.onEnd(successfulRun);

    expect(
      fs.readFileSync(
        path.join(directories.docs, 'getting-started', 'page.md'),
        'utf8',
      ),
    ).toContain('Explicit guide content');
    expect(
      fs.existsSync(path.join(directories.docs, 'getting-started-2', 'page.md')),
    ).toBe(false);
  } finally {
    restore();
  }
});

test('rejects two explicit guide IDs that claim the same slug', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase('First guide', 'first-guide', { line: 10 }),
      createResult('passed', [
        guideAttachment({
          id: 'first-guide',
          slug: 'shared-guide',
          title: 'First guide',
        }),
        markdownAttachment(),
      ]),
    );
    reporter.onTestEnd(
      createTestCase('Second guide', 'second-guide', { line: 20 }),
      createResult('passed', [
        guideAttachment({
          id: 'second-guide',
          slug: 'shared-guide',
          title: 'Second guide',
        }),
        markdownAttachment(),
      ]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.existsSync(directories.docs)).toBe(false);
  } finally {
    restore();
  }
});

test('rejects explicit and legacy slug collisions in either result order', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const legacy = () => ({
      result: createResult('passed', [markdownAttachment('Legacy content')]),
      test: createTestCase('Legacy section', 'legacy-guide', {
        line: 10,
        titlePath: ['', '/tmp/legacy.doc.ts', 'Shared guide', 'Legacy section'],
      }),
    });
    const explicit = () => ({
      result: createResult('passed', [
        guideAttachment({
          id: 'explicit-guide',
          slug: 'shared-guide',
          title: 'Explicit guide',
        }),
        markdownAttachment('Explicit content'),
      ]),
      test: createTestCase('Explicit section', 'explicit-guide', { line: 20 }),
    });

    for (const attachmentOrder of [
      [legacy, explicit],
      [explicit, legacy],
    ] as const) {
      const reporter = new DocumentationReporter();
      startReporter(reporter);
      for (const createAttachment of attachmentOrder) {
        const { result, test: documentedTest } = createAttachment();
        reporter.onTestEnd(documentedTest, result);
      }
      await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
        status: 'failed',
      });
    }
    expect(fs.existsSync(directories.docs)).toBe(false);
  } finally {
    restore();
  }
});

test('refuses to overwrite an unmanaged output file', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const manualPage = path.join(directories.docs, 'getting-started', 'page.md');
    fs.mkdirSync(path.dirname(manualPage), { recursive: true });
    fs.writeFileSync(manualPage, 'hand-authored guide with the generated path');

    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment('Generated replacement')]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.readFileSync(manualPage, 'utf8')).toBe(
      'hand-authored guide with the generated path',
    );
    expect(
      fs.existsSync(path.join(directories.docs, '.docs-tests-manifest.json')),
    ).toBe(false);
  } finally {
    restore();
  }
});

test('refuses to replace a generated file that was manually edited', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const initialReporter = new DocumentationReporter();
    startReporter(initialReporter);
    initialReporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment('Original generated content')]),
    );
    await initialReporter.onEnd(successfulRun);

    const page = path.join(directories.docs, 'getting-started', 'page.md');
    fs.writeFileSync(page, 'manually revised generated guide');

    const reporter = new DocumentationReporter();
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment('New generated content')]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.readFileSync(page, 'utf8')).toBe(
      'manually revised generated guide',
    );
  } finally {
    restore();
  }
});

test('preserves a modified generated file instead of pruning it', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const initialReporter = new DocumentationReporter();
    startReporter(initialReporter);
    initialReporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment('Original generated content')]),
    );
    await initialReporter.onEnd(successfulRun);

    const originalPage = path.join(
      directories.docs,
      'getting-started',
      'page.md',
    );
    fs.writeFileSync(originalPage, 'manually revised generated guide');

    const reporter = new DocumentationReporter({
      clean: 'manifest-owned',
      fullRun: true,
    });
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase('Document another guide', 'another-guide', {
        titlePath: ['', '/tmp/another.doc.ts', 'Another guide', 'Document another guide'],
      }),
      createResult('passed', [markdownAttachment('New guide')]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.readFileSync(originalPage, 'utf8')).toBe(
      'manually revised generated guide',
    );
  } finally {
    restore();
  }
});

test('requires an explicit complete-run assertion before manifest-owned clean', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const reporter = new DocumentationReporter({ clean: 'manifest-owned' });
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment()]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.existsSync(directories.docs)).toBe(false);
  } finally {
    restore();
  }
});

test('refuses manifest-owned clean for a sharded run', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const reporter = new DocumentationReporter({
      clean: 'manifest-owned',
      fullRun: true,
    });
    startReporter(reporter, {
      grep: /.*/,
      grepInvert: null,
      shard: { current: 1, total: 2 },
    });
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment()]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.existsSync(directories.docs)).toBe(false);
  } finally {
    restore();
  }
});

test('does not publish a filtered run even without cleanup enabled', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const reporter = new DocumentationReporter();
    startReporter(reporter, { grep: /billing/ });
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment()]),
    );

    await expect(reporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.existsSync(directories.docs)).toBe(false);
  } finally {
    restore();
  }
});

test('manifest-owned clean prunes prior output when no guides remain', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const initialReporter = new DocumentationReporter();
    startReporter(initialReporter);
    initialReporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment(), imageAttachment()]),
    );
    await initialReporter.onEnd(successfulRun);

    const oldPage = path.join(
      directories.docs,
      'getting-started',
      'page.md',
    );
    const oldImage = fs.readdirSync(
      path.join(directories.images, 'getting-started'),
    )[0]!;
    const reporter = new DocumentationReporter({
      clean: 'manifest-owned',
      fullRun: true,
    });
    startReporter(reporter);
    await reporter.onEnd(successfulRun);

    expect(fs.existsSync(oldPage)).toBe(false);
    expect(
      fs.existsSync(path.join(directories.images, 'getting-started', oldImage)),
    ).toBe(false);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(directories.docs, 'docs-tests.bundle.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({ guides: [], schemaVersion: 'docs-tests.bundle/v1alpha1' });
  } finally {
    restore();
  }
});

test('rejects unsafe guide paths and unsupported image content types before publishing', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const invalidGuideReporter = new DocumentationReporter();
    startReporter(invalidGuideReporter);
    invalidGuideReporter.onTestEnd(
      createTestCase(),
      createResult('passed', [
        guideAttachment({
          id: 'unsafe-guide',
          slug: '../outside',
          title: 'Unsafe guide',
        }),
        markdownAttachment(),
      ]),
    );
    await expect(invalidGuideReporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });

    const invalidImageReporter = new DocumentationReporter();
    startReporter(invalidImageReporter);
    invalidImageReporter.onTestEnd(
      createTestCase('Capture a screenshot', 'unsafe-image'),
      createResult('passed', [
        markdownAttachment(),
        {
          body: Buffer.from('not an image'),
          contentType: 'image/../../outside',
          name: 'image',
        } as unknown as TestResult['attachments'][number],
      ]),
    );
    await expect(invalidImageReporter.onEnd(successfulRun)).resolves.toEqual({
      status: 'failed',
    });
    expect(fs.existsSync(directories.docs)).toBe(false);
    expect(fs.existsSync(directories.images)).toBe(false);
  } finally {
    restore();
  }
});

test('list-only mode does not touch configured output', async ({}, testInfo) => {
  const directories = {
    docs: testInfo.outputPath('docs'),
    images: testInfo.outputPath('images'),
  };
  const restore = setOutputDirectories(directories);

  try {
    const existingPage = path.join(directories.docs, 'manual', 'page.md');
    fs.mkdirSync(path.dirname(existingPage), { recursive: true });
    fs.writeFileSync(existingPage, 'hand-authored guide');

    const reporter = new DocumentationReporter({ listOnly: true });
    startReporter(reporter);
    reporter.onTestEnd(
      createTestCase(),
      createResult('passed', [markdownAttachment('new output')]),
    );
    await reporter.onEnd(successfulRun);

    expect(fs.readFileSync(existingPage, 'utf8')).toBe('hand-authored guide');
    expect(fs.existsSync(directories.images)).toBe(false);
  } finally {
    restore();
  }
});
