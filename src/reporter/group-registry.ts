import type { Suite, TestCase } from '@playwright/test/reporter';

import type { GuideMetadata } from '../schema.js';
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
  private readonly explicitFolderOwners = new Map<string, string>();
  private readonly folderCounts = new Map<string, number>();
  private readonly testLookup = new Map<string, TestGroupInfo>();

  clear() {
    this.documents.clear();
    this.explicitFolderOwners.clear();
    this.folderCounts.clear();
    this.testLookup.clear();
  }

  resolveForTest(test: TestCase, guide?: GuideMetadata) {
    const key = this.testLookupKey(test);
    const existing = this.testLookup.get(key);
    if (!guide) return existing ?? this.registerTestGroup(test);
    if (existing?.groupKey === `guide:${guide.id}`) return existing;
    return this.registerTestGroup(test, guide);
  }

  appendTestSection(test: TestCase, section: TestSection) {
    const info = this.resolveForTest(test, section.guide);
    this.ensureDocument(info, section.guide).sections.push(section);
  }

  getDocuments() {
    return [...this.documents.values()];
  }

  private ensureDocument(info: TestGroupInfo, guide?: GuideMetadata) {
    const existing = this.documents.get(info.groupKey);
    if (existing) {
      if (
        guide &&
        existing.guide &&
        JSON.stringify(existing.guide) !== JSON.stringify(guide)
      )
        throw new Error(`Conflicting metadata for guide "${guide.id}".`);
      if (guide && !existing.guide) existing.guide = guide;
      return existing;
    }

    const created: TestGroupDocument = {
      describeTitle: info.describeTitle,
      filePath: info.filePath,
      folderName: info.folderName,
      ...(guide ? { guide } : {}),
      sections: [],
    };
    this.documents.set(info.groupKey, created);
    return created;
  }

  private registerTestGroup(test: TestCase, guide?: GuideMetadata) {
    const key = this.testLookupKey(test);
    const resolved = this.resolveGroupInfoFromTest(test, guide);
    const existing = this.documents.get(resolved.groupKey);
    const info = existing
      ? { ...resolved, folderName: existing.folderName }
      : guide
        ? this.registerExplicitGuide(resolved, guide)
        : {
          ...resolved,
          folderName: this.allocateFolderName(resolved.folderName),
        };

    this.testLookup.set(key, info);
    this.ensureDocument(info, guide);
    return info;
  }

  private resolveGroupInfoFromTest(
    test: TestCase,
    guide?: GuideMetadata,
  ): TestGroupInfo {
    if (guide) {
      return {
        describeTitle: guide.title,
        filePath: test.location?.file,
        folderName: guide.slug,
        groupKey: `guide:${guide.id}`,
      };
    }

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
    const candidate = this.folderNameWithCount(baseName, nextCount);
    if (this.explicitFolderOwners.has(candidate))
      throw new Error(
        `Legacy documentation folder "${candidate}" conflicts with an explicit guide slug. Add explicit guide metadata to both guides or choose another slug.`,
      );
    this.folderCounts.set(baseName, nextCount);
    return candidate;
  }

  private registerExplicitGuide(info: TestGroupInfo, guide: GuideMetadata) {
    const legacyDocument = [...this.documents.entries()].find(
      ([groupKey, document]) =>
        !groupKey.startsWith('guide:') && document.folderName === guide.slug,
    );
    if (legacyDocument)
      throw new Error(
        `Guide slug "${guide.slug}" conflicts with legacy documentation. Add explicit guide metadata to both guides or choose another slug.`,
      );
    const owner = this.explicitFolderOwners.get(guide.slug);
    if (owner && owner !== info.groupKey)
      throw new Error(
        `Guide slug "${guide.slug}" is already used by another guide id.`,
      );
    this.explicitFolderOwners.set(guide.slug, info.groupKey);
    return info;
  }

  private folderNameWithCount(baseName: string, count: number) {
    if (count === 1) return baseName;
    const suffix = `-${count}`;
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
