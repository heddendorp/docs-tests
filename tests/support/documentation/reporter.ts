import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import path from 'node:path';

import { buildSectionContent } from './reporter/attachments';
import { DocumentationGroupRegistry } from './reporter/group-registry';
import {
  DOCUMENTATION_ATTACHMENT_NAMES,
  ensureDirectory,
  readDocumentationEnvironment,
  stripTagsFromTitle,
  titleFromTestFile,
  writeFile,
} from './reporter/shared';

class DocumentationReporter implements Reporter {
  private readonly environment = readDocumentationEnvironment();
  private readonly registry = new DocumentationGroupRegistry();

  private get listOnly(): boolean {
    return process.argv.includes('--list');
  }

  onBegin(_config: FullConfig, suite: Suite) {
    if (this.listOnly) return;

    this.registry.clear();
    this.registry.registerSuite(suite);
    ensureDirectory(this.environment.docsOutputDirectory, { empty: true });
    ensureDirectory(this.environment.docsImageOutputDirectory, { empty: true });
    console.log(
      `[docs-reporter] docs=${this.environment.docsOutputDirectory} images=${this.environment.docsImageOutputDirectory}`,
    );
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (this.listOnly) return;

    const attachments = result.attachments.filter((attachment) =>
      DOCUMENTATION_ATTACHMENT_NAMES.has(attachment.name),
    );
    if (attachments.length === 0) return;

    const groupInfo = this.registry.resolveForTest(test);
    const imageDirectory = ensureDirectory(
      path.join(
        this.environment.docsImageOutputDirectory,
        groupInfo.folderName,
      ),
    );
    const content = buildSectionContent({
      attachments,
      folderName: groupInfo.folderName,
      imageDirectory,
      imagePublicPath: this.environment.imagePublicPath,
      test,
    });

    this.registry.appendTestSection(test, {
      content,
      line: test.location?.line ?? Number.MAX_SAFE_INTEGER,
      title: stripTagsFromTitle(test.title) || 'Test',
    });
  }

  onEnd(_result: FullResult) {
    if (this.listOnly) return;

    for (const doc of this.registry.getDocuments()) {
      if (doc.sections.length === 0) continue;

      const sections = [...doc.sections].sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.title.localeCompare(b.title);
      });
      const hasMultipleSections = sections.length > 1;
      const title =
        doc.describeTitle ??
        (hasMultipleSections
          ? titleFromTestFile(doc.filePath ?? doc.folderName)
          : sections[0].title);
      const pageLines = [`---\ntitle: ${title}\n---`];

      for (const [index, section] of sections.entries()) {
        if (index > 0) pageLines.push('');
        if (hasMultipleSections) pageLines.push(`## ${section.title}`);
        pageLines.push(...section.content);
      }

      const pageDirectory = ensureDirectory(
        path.join(this.environment.docsOutputDirectory, doc.folderName),
      );
      writeFile(path.join(pageDirectory, 'page.md'), pageLines.join('\n'));
    }
  }
}

export default DocumentationReporter;
