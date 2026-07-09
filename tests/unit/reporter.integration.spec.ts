import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

test('publishes documentation from the passing retry in a real Playwright run', ({
  }, testInfo) => {
  const fixtureRoot = testInfo.outputPath('fixture');
  const testDirectory = path.join(fixtureRoot, 'tests');
  const docsDirectory = path.join(fixtureRoot, 'docs');
  const imagesDirectory = path.join(fixtureRoot, 'images');
  const outputDirectory = path.join(fixtureRoot, 'playwright-output');
  const configPath = path.join(fixtureRoot, 'playwright.config.ts');
  const reporterPath = path.resolve('src/reporter.ts');
  const playwrightCli = path.resolve('node_modules/playwright/cli.js');

  fs.mkdirSync(testDirectory, { recursive: true });
  fs.writeFileSync(
    configPath,
    `
      import { defineConfig } from '@playwright/test';

      export default defineConfig({
        reporter: [['dot'], [${JSON.stringify(reporterPath)}]],
        retries: 1,
        outputDir: ${JSON.stringify(outputDirectory)},
        testDir: ${JSON.stringify(testDirectory)},
        workers: 1,
      });
    `,
  );
  fs.writeFileSync(
    path.join(testDirectory, 'retry.spec.ts'),
    `
      import { test } from '@playwright/test';

      test('Retry documentation', async ({}, testInfo) => {
        if (testInfo.retry === 0) {
          await testInfo.attach('docs-tests:markdown', {
            body: 'failed-attempt prose',
            contentType: 'text/markdown',
          });
          throw new Error('fail the first attempt');
        }

        await testInfo.attach('docs-tests:markdown', {
          body: 'verified retry prose',
          contentType: 'text/markdown',
        });
      });
    `,
  );

  const result = spawnSync(
    process.execPath,
    [playwrightCli, 'test', '--config', configPath],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCS_IMG_OUT_DIR: imagesDirectory,
        DOCS_OUT_DIR: docsDirectory,
      },
    },
  );

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  const page = fs.readFileSync(
    path.join(docsDirectory, 'retry-documentation', 'page.md'),
    'utf8',
  );
  expect(page).toContain('verified retry prose');
  expect(page).not.toContain('failed-attempt prose');
});
