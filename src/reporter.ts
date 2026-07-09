import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildSectionContent,
  getGuideMetadata,
} from './reporter/attachments.js';
import { DocumentationGroupRegistry } from './reporter/group-registry.js';
import {
  publishStagedOutput,
  type OutputCleanMode,
} from './reporter/output.js';
import { createBundle, renderDocument } from './reporter/render.js';
import {
  DOCS_TESTS_BUNDLE_FILE,
  ensureDirectory,
  isDocumentationAttachmentName,
  readDocumentationEnvironment,
  stripTagsFromTitle,
  type TestSection,
  writeFile,
} from './reporter/shared.js';

export type DocumentationReporterOptions = {
  /** Remove only files recorded in the previous docs-tests output manifest. */
  clean?: boolean | 'manifest-owned';
  /** Assert that this invocation covers the complete documentation suite. */
  fullRun?: boolean;
  /** Disable generation, including when the reporter is constructed directly. */
  listOnly?: boolean;
};

type StagingDirectories = {
  docsOutputDirectory: string;
  docsImageOutputDirectory: string;
  root: string;
};

class DocumentationReporter implements Reporter {
  private readonly environment = readDocumentationEnvironment();
  private readonly registry = new DocumentationGroupRegistry();
  private readonly processedTestLocations = new Map<string, string>();
  private generationError: unknown;
  private partialRun = false;
  private stagingDirectories?: StagingDirectories;

  constructor(private readonly options: DocumentationReporterOptions = {}) {}

  private get listOnly(): boolean {
    return this.options.listOnly ?? process.argv.includes('--list');
  }

  onBegin(config: FullConfig, _suite: Suite) {
    this.cleanupStagingDirectories();
    this.generationError = undefined;
    if (this.listOnly) return;

    try {
      this.registry.clear();
      this.processedTestLocations.clear();
      this.partialRun = this.isPartialRun(config);

      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-tests-'));
      this.stagingDirectories = {
        docsImageOutputDirectory: ensureDirectory(path.join(root, 'images')),
        docsOutputDirectory: ensureDirectory(path.join(root, 'docs')),
        root,
      };
      console.log(
        `[docs-reporter] docs=${this.environment.docsOutputDirectory} images=${this.environment.docsImageOutputDirectory}`,
      );
    } catch (error) {
      this.recordGenerationError('initialize', error);
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (
      this.listOnly ||
      result.status !== 'passed' ||
      this.generationError !== undefined
    )
      return;

    try {
      const stagingDirectories = this.stagingDirectories;
      if (!stagingDirectories)
        throw new Error('Documentation reporter did not initialize staging.');

      const attachments = result.attachments.filter((attachment) =>
        isDocumentationAttachmentName(attachment.name),
      );
      if (attachments.length === 0) return;

      const testLocation = this.testLocationKey(test);

      const guide = getGuideMetadata(attachments, test.title);
      const groupInfo = this.registry.resolveForTest(test, guide);
      const imageDirectory = ensureDirectory(
        path.join(
          stagingDirectories.docsImageOutputDirectory,
          groupInfo.folderName,
        ),
      );
      const content = buildSectionContent({
        attachments,
        folderName: groupInfo.folderName,
        ...(guide ? { guide } : {}),
        imageDirectory,
        imagePublicPath: this.environment.imagePublicPath,
        test,
      });

      const section: TestSection = {
        blocks: content.blocks,
        ...(content.guide ? { guide: content.guide } : {}),
        line: test.location?.line ?? Number.MAX_SAFE_INTEGER,
        source: {
          ...(test.location?.file ? { file: test.location.file } : {}),
          ...(test.location?.line === undefined
            ? {}
            : { line: test.location.line }),
          ...(typeof test.titlePath === 'function'
            ? { titlePath: test.titlePath() }
            : {}),
        },
        title: stripTagsFromTitle(test.title) || 'Test',
      };
      const fingerprint = JSON.stringify(section);
      const priorFingerprint = this.processedTestLocations.get(testLocation);
      if (priorFingerprint) {
        if (priorFingerprint !== fingerprint)
          throw new Error(
            `Conflicting documentation for source test "${testLocation}" across projects or repeats. Configure one canonical docs project.`,
          );
        return;
      }

      this.registry.appendTestSection(test, section);
      this.processedTestLocations.set(testLocation, fingerprint);
    } catch (error) {
      this.recordGenerationError('process test attachments', error);
    }
  }

  async onEnd(result: FullResult) {
    if (this.listOnly) return;

    try {
      if (this.generationError !== undefined)
        return { status: 'failed' } as const;
      if (result.status !== 'passed') {
        console.warn(
          `[docs-reporter] Skipping documentation publish because the run ended with ${result.status}.`,
        );
        return;
      }

      const stagingDirectories = this.stagingDirectories;
      if (!stagingDirectories)
        throw new Error('Documentation reporter did not initialize staging.');

      const clean = this.cleanMode();
      if (clean !== 'none' && !this.options.fullRun)
        throw new Error(
          'Manifest-owned clean requires reporter option fullRun: true. Set it only in a command that runs the complete documentation suite.',
        );
      if (this.partialRun)
        throw new Error(
          'Documentation publish is unavailable for filtered, targeted, or sharded runs. Merge complete blob reports before publishing.',
        );

      const documents = this.registry
        .getDocuments()
        .filter((doc) => doc.sections.length > 0);
      if (documents.length === 0 && clean === 'none') return;

      const renderedDocuments = documents.map((document) =>
        renderDocument({
          document,
          imagePublicPath: this.environment.imagePublicPath,
        }),
      );
      for (const [index, doc] of documents.entries()) {
        const pageDirectory = ensureDirectory(
          path.join(stagingDirectories.docsOutputDirectory, doc.folderName),
        );
        writeFile(path.join(pageDirectory, 'page.md'), renderedDocuments[index].page);
      }
      writeFile(
        path.join(stagingDirectories.docsOutputDirectory, DOCS_TESTS_BUNDLE_FILE),
        `${JSON.stringify(
          createBundle(renderedDocuments.map((document) => document.bundleGuide)),
          null,
          2,
        )}\n`,
      );

      publishStagedOutput({
        clean,
        docs: {
          outputRoot: this.environment.docsOutputDirectory,
          stagingRoot: stagingDirectories.docsOutputDirectory,
        },
        images: {
          outputRoot: this.environment.docsImageOutputDirectory,
          stagingRoot: stagingDirectories.docsImageOutputDirectory,
        },
      });
    } catch (error) {
      this.recordGenerationError('publish documentation', error);
      return { status: 'failed' } as const;
    } finally {
      this.cleanupStagingDirectories();
    }
  }

  private recordGenerationError(phase: string, error: unknown) {
    this.generationError ??= error;
    console.error(`[docs-reporter] Failed to ${phase}.`, error);
  }

  private testLocationKey(test: TestCase) {
    return `${test.location?.file ?? 'unknown'}:${test.location?.line ?? -1}:${test.title}`;
  }

  private cleanMode(): OutputCleanMode {
    return this.options.clean ? 'manifest-owned' : 'none';
  }

  private isPartialRun(config: FullConfig) {
    if (config.shard) return true;
    if (config.grep && !isDefaultGrep(config.grep)) return true;
    if (config.grepInvert) return true;

    return [...process.argv, ...(config.argv ?? [])].some(
      (argument) =>
        argument === '--grep' ||
        argument === '-g' ||
        argument === '--grep-invert' ||
        argument === '--only-changed' ||
        argument === '--last-failed' ||
        argument === '--shard' ||
        argument.startsWith('--grep=') ||
        argument.startsWith('--grep-invert=') ||
        argument.startsWith('--shard=') ||
        argument.startsWith('-g') ||
        isTestFileArgument(argument),
    );
  }

  private cleanupStagingDirectories() {
    const stagingDirectories = this.stagingDirectories;
    this.stagingDirectories = undefined;
    if (!stagingDirectories) return;

    try {
      fs.rmSync(stagingDirectories.root, { force: true, recursive: true });
    } catch (error) {
      console.warn('[docs-reporter] Failed to remove temporary output.', error);
    }
  }
}

function isDefaultGrep(grep: FullConfig['grep']) {
  const patterns = Array.isArray(grep) ? grep : [grep];
  return (
    patterns.length === 1 &&
    patterns[0] instanceof RegExp &&
    patterns[0].source === '.*' &&
    patterns[0].flags === ''
  );
}

function isTestFileArgument(argument: string) {
  if (
    argument.startsWith('-') ||
    /(?:^|[/\\])node_modules(?:[/\\]|$)/.test(argument) ||
    /(?:^|[/\\])playwright\.config\./.test(argument) ||
    argument.startsWith('playwright.config.')
  )
    return false;
  return /(?:^|[/\\]).+\.(?:[cm]?[jt]sx?)$/i.test(argument);
}

export { takeDocScreenshot, takeScreenshot } from './screenshot.js';
export type {
  DocumentationImageMetadata,
  DocumentationScreenshotOptions,
  ScreenshotCaption,
  ScreenshotMask,
  ScreenshotRedaction,
} from './screenshot.js';
export default DocumentationReporter;
