import type { Suite, TestCase } from '@playwright/test/reporter';

import {
  findFileSegmentIndex,
  MAX_FOLDER_NAME_LENGTH,
  slugifyFolderNameFromTitle,
  slugifyTestTitle,
  stripTagsFromTitle,
  type TestGroupDocument,
  type TestGroupInfo,
  type TestSection,
} from './shared.js';

export class DocumentationGroupRegistry {
  private readonly documents = new Map<string, TestGroupDocument>();
  private readonly folderCounts = new Map<string, number>();
  private readonly testLookup = new Map<string, TestGroupInfo>();

  clear() {
    this.documents.clear();
    this.folderCounts.clear();
    this.testLookup.clear();
  }

  registerSuite(suite: Suite) {
    for (const test of suite.allTests()) {
      this.registerTestGroup(test);
    }
  }

  resolveForTest(test: TestCase) {
    const key = this.testLookupKey(test);
    return this.testLookup.get(key) ?? this.registerTestGroup(test);
  }

  appendTestSection(test: TestCase, section: TestSection) {
    const info = this.resolveForTest(test);
    this.ensureDocument(info).sections.push(section);
  }

  getDocuments() {
    return [...this.documents.values()];
  }

  private ensureDocument(info: TestGroupInfo) {
    const existing = this.documents.get(info.groupKey);
    if (existing) return existing;

    const created: TestGroupDocument = {
      describeTitle: info.describeTitle,
      filePath: info.filePath,
      folderName: info.folderName,
      sections: [],
    };
    this.documents.set(info.groupKey, created);
    return created;
  }

  private registerTestGroup(test: TestCase) {
    const key = this.testLookupKey(test);
    const resolved = this.resolveGroupInfoFromTest(test);
    const existing = this.documents.get(resolved.groupKey);
    const info = existing
      ? { ...resolved, folderName: existing.folderName }
      : {
          ...resolved,
          folderName: this.allocateFolderName(resolved.folderName),
        };

    this.testLookup.set(key, info);
    this.ensureDocument(info);
    return info;
  }

  private resolveGroupInfoFromTest(test: TestCase): TestGroupInfo {
    const cleanTitle = stripTagsFromTitle(test.title) || 'Test';
    let filePath = test.location?.file;
    const describeTitles: string[] = [];
    let suiteCursor: Suite | undefined = test.parent;

    while (suiteCursor) {
      if (suiteCursor.type === 'file' && !filePath)
        filePath = suiteCursor.title;
      if (suiteCursor.type === 'describe') {
        const title = stripTagsFromTitle(suiteCursor.title);
        if (title) describeTitles.push(title);
      }
      suiteCursor = suiteCursor.parent;
    }

    describeTitles.reverse();

    if (describeTitles.length === 0) {
      const titlePath =
        typeof test.titlePath === 'function' ? test.titlePath() : [];
      const fileSegmentIndex = findFileSegmentIndex(titlePath);
      if (!filePath && fileSegmentIndex >= 0)
        filePath = titlePath[fileSegmentIndex];
      describeTitles.push(
        ...titlePath
          .slice(fileSegmentIndex + 1, -1)
          .map((title) => stripTagsFromTitle(title))
          .filter(Boolean),
      );
    }

    const describeTitle = describeTitles.at(-1);
    const groupKey = describeTitle
      ? `describe:${filePath ?? 'unknown'}:${describeTitles.join(' > ')}`
      : `test:${filePath ?? 'unknown'}:${slugifyTestTitle(cleanTitle)}`;

    return {
      describeTitle,
      filePath,
      folderName: slugifyFolderNameFromTitle(describeTitle ?? cleanTitle),
      groupKey,
    };
  }

  private allocateFolderName(baseName: string) {
    const nextCount = (this.folderCounts.get(baseName) ?? 0) + 1;
    this.folderCounts.set(baseName, nextCount);
    if (nextCount === 1) return baseName;

    const suffix = `-${nextCount}`;
    return `${baseName
      .slice(0, Math.max(1, MAX_FOLDER_NAME_LENGTH - suffix.length))
      .replace(/-+$/g, '')}${suffix}`;
  }

  private testLookupKey(test: TestCase) {
    return (
      test.id ??
      `${test.location?.file ?? 'unknown'}:${test.location?.line ?? -1}:${test.title}`
    );
  }
}
