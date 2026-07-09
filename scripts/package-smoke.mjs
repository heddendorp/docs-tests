import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required to run the package smoke test.');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-tests-pack-'));

function runNpm(args, options) {
  return execFileSync(process.execPath, [npmCli, ...args], options);
}

try {
  const packDirectory = path.join(temporaryRoot, 'pack');
  fs.mkdirSync(packDirectory, { recursive: true });
  const packed = JSON.parse(
    runNpm(
      ['pack', '--json', '--pack-destination', packDirectory],
      { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    ),
  );
  const packageInfo = packed.at(0);
  if (!packageInfo?.filename)
    throw new Error('npm pack did not return a package filename.');

  const packedFiles = new Set(
    packageInfo.files?.map((file) => file.path) ?? [],
  );
  for (const requiredFile of [
    'LICENSE',
    'README.md',
    'dist/index.d.ts',
    'dist/index.js',
    'package.json',
  ]) {
    if (!packedFiles.has(requiredFile))
      throw new Error(`Packed tarball is missing ${requiredFile}.`);
  }

  const consumerDirectory = path.join(temporaryRoot, 'consumer');
  fs.mkdirSync(consumerDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      path.join(packDirectory, packageInfo.filename),
      '@playwright/test@1.61.1',
    ],
    { cwd: consumerDirectory, stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        const root = await import('docs-tests');
        const reporter = await import('docs-tests/reporter');
        if (
          typeof root.attachGuide !== 'function' ||
          typeof root.attachMarkdown !== 'function' ||
          typeof root.takeDocScreenshot !== 'function' ||
          typeof reporter.default !== 'function'
        ) {
          throw new Error('Packed docs-tests exports are incomplete.');
        }
      `,
    ],
    { cwd: consumerDirectory, stdio: 'inherit' },
  );
} finally {
  fs.rmSync(temporaryRoot, { force: true, recursive: true });
}
