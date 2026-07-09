import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { publishStagedOutput } from '../../src/reporter/output.js';

type FileContents = Record<string, string>;

const writeStagingFiles = (root: string, files: FileContents) => {
  fs.mkdirSync(root, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
};

const publish = (input: {
  clean?: 'manifest-owned' | 'none';
  docsOutput: string;
  docsStaging: string;
  imagesOutput: string;
  imagesStaging: string;
}) =>
  publishStagedOutput({
    clean: input.clean ?? 'none',
    docs: {
      outputRoot: input.docsOutput,
      stagingRoot: input.docsStaging,
    },
    images: {
      outputRoot: input.imagesOutput,
      stagingRoot: input.imagesStaging,
    },
  });

test('binds manifest-owned cleanup to the output-root pair that created it', ({
  }, testInfo) => {
  const docsOutput = testInfo.outputPath('docs');
  const imagesOutput = testInfo.outputPath('images-a');
  const docsStaging = testInfo.outputPath('stage/docs-a');
  const imagesStaging = testInfo.outputPath('stage/images-a');
  writeStagingFiles(docsStaging, { 'guide/page.md': 'first version' });
  writeStagingFiles(imagesStaging, { 'guide/image.png': 'first image' });

  publish({ docsOutput, docsStaging, imagesOutput, imagesStaging });

  const nextDocsStaging = testInfo.outputPath('stage/docs-b');
  const nextImagesStaging = testInfo.outputPath('stage/images-b');
  const changedImagesOutput = testInfo.outputPath('images-b');
  writeStagingFiles(nextDocsStaging, { 'guide/page.md': 'second version' });
  writeStagingFiles(nextImagesStaging, { 'guide/image.png': 'second image' });

  expect(() =>
    publish({
      clean: 'manifest-owned',
      docsOutput,
      docsStaging: nextDocsStaging,
      imagesOutput: changedImagesOutput,
      imagesStaging: nextImagesStaging,
    }),
  ).toThrow('output roots changed');
  expect(fs.readFileSync(path.join(docsOutput, 'guide/page.md'), 'utf8')).toBe(
    'first version',
  );
  expect(
    fs.readFileSync(path.join(imagesOutput, 'guide/image.png'), 'utf8'),
  ).toBe('first image');
});

test('rejects symbolic-link output roots and overlapping output directories', ({
  }, testInfo) => {
  const docsStaging = testInfo.outputPath('stage/docs');
  const imagesStaging = testInfo.outputPath('stage/images');
  writeStagingFiles(docsStaging, { 'guide/page.md': 'content' });
  writeStagingFiles(imagesStaging, { 'guide/image.png': 'image' });

  const realDocsOutput = testInfo.outputPath('real-docs');
  const linkedDocsOutput = testInfo.outputPath('linked-docs');
  fs.mkdirSync(realDocsOutput, { recursive: true });
  fs.symlinkSync(
    realDocsOutput,
    linkedDocsOutput,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  expect(() =>
    publish({
      docsOutput: linkedDocsOutput,
      docsStaging,
      imagesOutput: testInfo.outputPath('images'),
      imagesStaging,
    }),
  ).toThrow('symbolic link');

  const docsOutput = testInfo.outputPath('docs');
  expect(() =>
    publish({
      docsOutput,
      docsStaging,
      imagesOutput: path.join(docsOutput, 'assets'),
      imagesStaging,
    }),
  ).toThrow('equal or disjoint');
});

test('rejects a manifest that attempts to manage an unsafe path', ({}, testInfo) => {
  const docsOutput = testInfo.outputPath('docs');
  const imagesOutput = testInfo.outputPath('images');
  const docsStaging = testInfo.outputPath('stage/docs');
  const imagesStaging = testInfo.outputPath('stage/images');
  fs.mkdirSync(docsOutput, { recursive: true });
  fs.writeFileSync(
    path.join(docsOutput, '.docs-tests-manifest.json'),
    JSON.stringify({
      docs: ['../outside.md'],
      images: [],
      schemaVersion: 'docs-tests.output-manifest/v1alpha1',
    }),
  );
  writeStagingFiles(docsStaging, { 'guide/page.md': 'content' });
  writeStagingFiles(imagesStaging, {});

  expect(() =>
    publish({ docsOutput, docsStaging, imagesOutput, imagesStaging }),
  ).toThrow('unsafe path segment');
  expect(fs.existsSync(testInfo.outputPath('outside.md'))).toBe(false);
});
