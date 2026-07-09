import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeRelativePosixPath } from '../schema.js';
import { DOCS_TESTS_OUTPUT_MANIFEST_FILE } from './shared.js';

export type GeneratedOutputManifest = {
  contentHashes: OutputContentHashes;
  docs: string[];
  images: string[];
  schemaVersion: 'docs-tests.output-manifest/v1alpha1';
  targetFingerprints: OutputTargetFingerprints;
};

export type OutputCleanMode = 'manifest-owned' | 'none';

type OutputTargetFingerprints = {
  docs: string;
  images: string;
};

type OutputContentHashes = {
  docs: Record<string, string>;
  images: Record<string, string>;
};

type PreviousOutputManifest = Omit<
  GeneratedOutputManifest,
  'contentHashes' | 'targetFingerprints'
> & {
  contentHashes?: OutputContentHashes;
  targetFingerprints?: OutputTargetFingerprints;
};

type OutputTarget = {
  outputRoot: string;
  stagingRoot: string;
};

export function publishStagedOutput(input: {
  clean: OutputCleanMode;
  docs: OutputTarget;
  images: OutputTarget;
}) {
  assertSafeOutputRoot(input.docs.outputRoot);
  assertSafeOutputRoot(input.images.outputRoot);
  assertDistinctOrEqualOutputRoots(input.docs.outputRoot, input.images.outputRoot);

  const targetFingerprints = getTargetFingerprints(input);
  let prior = readOutputManifest(input.docs.outputRoot);
  if (!hasMatchingTargetFingerprints(prior, targetFingerprints)) {
    if (input.clean === 'manifest-owned' && hasManagedPaths(prior))
      throw new Error(
        'The configured documentation output roots changed since the previous manifest. Run once without clean to establish ownership for the new roots.',
      );
    prior = retainOwnershipForMatchingRoots(prior, targetFingerprints);
  }
  assertManifestPathCollisions(input, prior);
  const docs = listStagedFiles(input.docs.stagingRoot);
  const images = listStagedFiles(input.images.stagingRoot);
  const generated: GeneratedOutputManifest = {
    contentHashes: {
      docs: createContentHashes(input.docs.stagingRoot, docs),
      images: createContentHashes(input.images.stagingRoot, images),
    },
    docs,
    images,
    schemaVersion: 'docs-tests.output-manifest/v1alpha1',
    targetFingerprints,
  };
  assertOutputPathCollisions(input, generated);
  assertPublishableFiles({
    priorPaths: prior.docs,
    priorHashes: prior.contentHashes?.docs,
    target: input.docs,
    targetHashes: generated.contentHashes.docs,
    targetPaths: generated.docs,
  });
  assertPublishableFiles({
    priorPaths: prior.images,
    priorHashes: prior.contentHashes?.images,
    target: input.images,
    targetHashes: generated.contentHashes.images,
    targetPaths: generated.images,
  });

  copyStagedFiles(input.docs, generated.docs);
  copyStagedFiles(input.images, generated.images);

  if (input.clean === 'manifest-owned') {
    removeStaleFiles({
      outputRoot: input.docs.outputRoot,
      priorHashes: prior.contentHashes?.docs,
      priorPaths: prior.docs,
      generatedPaths: generated.docs,
    });
    removeStaleFiles({
      outputRoot: input.images.outputRoot,
      priorHashes: prior.contentHashes?.images,
      priorPaths: prior.images,
      generatedPaths: generated.images,
    });
  }

  const next =
    input.clean === 'manifest-owned'
      ? generated
      : mergeOutputManifests(prior, generated);
  writeOutputManifest(input.docs.outputRoot, next);
  return next;
}

function assertOutputPathCollisions(
  input: { docs: OutputTarget; images: OutputTarget },
  manifest: GeneratedOutputManifest,
) {
  assertCaseInsensitiveUniqueness(manifest.docs, 'generated documentation');
  assertCaseInsensitiveUniqueness(manifest.images, 'generated images');
  if (!sameOutputRoot(input.docs.outputRoot, input.images.outputRoot))
    return;

  assertCaseInsensitiveUniqueness(
    [...manifest.docs, ...manifest.images],
    'generated output',
  );
}

function assertManifestPathCollisions(
  input: { docs: OutputTarget; images: OutputTarget },
  manifest: PreviousOutputManifest,
) {
  assertCaseInsensitiveUniqueness(manifest.docs, 'managed documentation');
  assertCaseInsensitiveUniqueness(manifest.images, 'managed images');
  if (sameOutputRoot(input.docs.outputRoot, input.images.outputRoot))
    assertCaseInsensitiveUniqueness(
      [...manifest.docs, ...manifest.images],
      'managed output',
    );
}

function assertDistinctOrEqualOutputRoots(docsRoot: string, imagesRoot: string) {
  const docs = outputRootComparisonKey(docsRoot);
  const images = outputRootComparisonKey(imagesRoot);
  if (docs === images) return;
  if (
    docs.startsWith(`${images}${path.sep}`) ||
    images.startsWith(`${docs}${path.sep}`)
  )
    throw new Error(
      'Documentation and image output roots must be equal or disjoint directories.',
    );
}

function assertCaseInsensitiveUniqueness(paths: readonly string[], label: string) {
  const seen = new Set<string>();
  for (const relativePath of paths) {
    const key = relativePath.toLocaleLowerCase('en-US');
    if (seen.has(key))
      throw new Error(`Case-insensitive collision in ${label}: "${relativePath}".`);
    seen.add(key);
  }
}

function assertSafeOutputRoot(outputRoot: string) {
  const absoluteRoot = path.resolve(outputRoot);
  if (absoluteRoot === path.parse(absoluteRoot).root)
    throw new Error('Refusing to use a filesystem root as documentation output.');
  assertNoSymlinkPathSegments(absoluteRoot);
  fs.mkdirSync(absoluteRoot, { recursive: true });
  const stat = fs.lstatSync(absoluteRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error(`Documentation output root is not a real directory: ${absoluteRoot}`);
}

function assertNoSymlinkPathSegments(targetPath: string) {
  const parsed = path.parse(targetPath);
  const segments = targetPath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let cursor = parsed.root;

  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const stat = lstatIfPresent(cursor);
    if (!stat) continue;
    if (stat.isSymbolicLink())
      throw new Error(`Refusing an output path containing a symbolic link: ${cursor}`);
  }
}

function copyStagedFiles(target: OutputTarget, paths: readonly string[]) {
  for (const relativePath of paths) {
    const sourcePath = resolveSafePath(target.stagingRoot, relativePath);
    writeFileAtomically(
      target.outputRoot,
      relativePath,
      fs.readFileSync(sourcePath),
    );
  }
}

function assertPublishableFiles(input: {
  priorHashes?: Record<string, string>;
  priorPaths: readonly string[];
  target: OutputTarget;
  targetHashes: Record<string, string>;
  targetPaths: readonly string[];
}) {
  const managedPaths = new Set(input.priorPaths);
  for (const relativePath of input.targetPaths) {
    const targetPath = resolveSafePath(input.target.outputRoot, relativePath);
    assertSafeOutputParent(input.target.outputRoot, relativePath);
    const stat = lstatIfPresent(targetPath);
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error(`Refusing to replace a non-file output path: ${relativePath}`);
    if (!managedPaths.has(relativePath))
      throw new Error(
        `Refusing to replace an unmanaged output file: ${relativePath}. Choose another guide slug or remove the conflicting file.`,
      );

    const expectedHash = input.priorHashes?.[relativePath];
    if (!expectedHash)
      throw new Error(
        `Cannot verify ownership of existing output file: ${relativePath}. Run without the existing manifest or move the file before publishing.`,
      );
    if (fileHash(targetPath) !== expectedHash)
      throw new Error(
        `Refusing to replace a modified generated output file: ${relativePath}. Preserve it elsewhere or restore the last generated content first.`,
      );
    if (!input.targetHashes[relativePath])
      throw new Error(`Missing generated content hash for: ${relativePath}.`);
  }
}

function listStagedFiles(root: string) {
  const files: string[] = [];
  walkDirectory(root, '', files);
  return files.sort((left, right) => left.localeCompare(right));
}

function walkDirectory(root: string, relativeDirectory: string, files: string[]) {
  const directory = relativeDirectory
    ? resolveSafePath(root, relativeDirectory)
    : root;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    const normalized = normalizeRelativePosixPath(
      relativePath,
      'Generated output path',
    );
    const entryPath = resolveSafePath(root, normalized);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink())
      throw new Error(`Generated output must not contain symbolic links: ${normalized}`);
    if (stat.isDirectory()) {
      walkDirectory(root, normalized, files);
      continue;
    }
    if (!stat.isFile())
      throw new Error(`Generated output must contain regular files: ${normalized}`);
    files.push(normalized);
  }
}

function mergeOutputManifests(
  prior: PreviousOutputManifest,
  generated: GeneratedOutputManifest,
): GeneratedOutputManifest {
  return {
    contentHashes: {
      docs: mergeContentHashes(
        prior.docs,
        prior.contentHashes?.docs,
        generated.docs,
        generated.contentHashes.docs,
      ),
      images: mergeContentHashes(
        prior.images,
        prior.contentHashes?.images,
        generated.images,
        generated.contentHashes.images,
      ),
    },
    docs: uniqueSorted([...prior.docs, ...generated.docs]),
    images: uniqueSorted([...prior.images, ...generated.images]),
    schemaVersion: 'docs-tests.output-manifest/v1alpha1',
    targetFingerprints: generated.targetFingerprints,
  };
}

function readOutputManifest(outputRoot: string): PreviousOutputManifest {
  const manifestPath = path.join(outputRoot, DOCS_TESTS_OUTPUT_MANIFEST_FILE);
  const manifestStat = lstatIfPresent(manifestPath);
  if (!manifestStat) return emptyOutputManifest();
  if (manifestStat.isSymbolicLink())
    throw new Error('Refusing a symbolic-link docs-tests output manifest.');
  if (!manifestStat.isFile())
    throw new Error('The docs-tests output manifest is not a regular file.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error('Unable to read the docs-tests output manifest.', {
      cause: error,
    });
  }

  if (!isOutputManifest(parsed))
    throw new Error('The docs-tests output manifest has an unsupported shape.');
  const docs = parsed.docs.map((file) =>
    normalizeRelativePosixPath(file, 'Output manifest documentation path'),
  );
  const images = parsed.images.map((file) =>
    normalizeRelativePosixPath(file, 'Output manifest image path'),
  );
  return {
    docs,
    images,
    schemaVersion: 'docs-tests.output-manifest/v1alpha1',
    ...(parsed.targetFingerprints
      ? { targetFingerprints: parsed.targetFingerprints }
      : {}),
    ...(parsed.contentHashes
      ? {
          contentHashes: {
            docs: normalizeContentHashes(
              parsed.contentHashes.docs,
              docs,
              'Output manifest documentation hash path',
            ),
            images: normalizeContentHashes(
              parsed.contentHashes.images,
              images,
              'Output manifest image hash path',
            ),
          },
        }
      : {}),
  };
}

function isOutputManifest(value: unknown): value is PreviousOutputManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GeneratedOutputManifest>;
  return (
    candidate.schemaVersion === 'docs-tests.output-manifest/v1alpha1' &&
    Array.isArray(candidate.docs) &&
    candidate.docs.every((file) => typeof file === 'string') &&
    Array.isArray(candidate.images) &&
    candidate.images.every((file) => typeof file === 'string') &&
    (candidate.contentHashes === undefined ||
      isOutputContentHashes(candidate.contentHashes)) &&
    (candidate.targetFingerprints === undefined ||
      isTargetFingerprints(candidate.targetFingerprints))
  );
}

function isOutputContentHashes(value: unknown): value is OutputContentHashes {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OutputContentHashes>;
  return (
    isContentHashRecord(candidate.docs) && isContentHashRecord(candidate.images)
  );
}

function isContentHashRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Object.values(record).every((hash) =>
      typeof hash === 'string' &&
      /^sha256:[a-f0-9]{64}$/.test(hash),
    )
  );
}

function isTargetFingerprints(value: unknown): value is OutputTargetFingerprints {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OutputTargetFingerprints>;
  return typeof candidate.docs === 'string' && typeof candidate.images === 'string';
}

function removeStaleFiles(input: {
  generatedPaths: readonly string[];
  outputRoot: string;
  priorHashes?: Record<string, string>;
  priorPaths: readonly string[];
}) {
  const retained = new Set(input.generatedPaths);
  for (const relativePath of input.priorPaths) {
    if (retained.has(relativePath)) continue;
    const targetPath = resolveSafePath(input.outputRoot, relativePath);
    const stat = lstatIfPresent(targetPath);
    if (!stat) continue;
    assertSafeOutputParent(input.outputRoot, relativePath);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error(
        `Managed output path is no longer a regular file: ${relativePath}`,
      );
    const expectedHash = input.priorHashes?.[relativePath];
    if (!expectedHash)
      throw new Error(
        `Cannot verify ownership of stale output file: ${relativePath}.`,
      );
    if (fileHash(targetPath) !== expectedHash)
      throw new Error(
        `Refusing to remove a modified generated output file: ${relativePath}.`,
      );
    fs.unlinkSync(targetPath);
  }
}

function writeOutputManifest(
  outputRoot: string,
  manifest: GeneratedOutputManifest,
) {
  writeFileAtomically(
    outputRoot,
    DOCS_TESTS_OUTPUT_MANIFEST_FILE,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function writeFileAtomically(
  outputRoot: string,
  relativePath: string,
  content: Buffer | string,
) {
  const targetPath = resolveSafePath(outputRoot, relativePath);
  assertSafeOutputParent(outputRoot, relativePath);
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  fs.writeFileSync(temporaryPath, content);
  fs.renameSync(temporaryPath, targetPath);
}

function assertSafeOutputParent(outputRoot: string, relativePath: string) {
  assertSafeOutputRoot(outputRoot);
  const segments = normalizeRelativePosixPath(relativePath, 'Output path').split('/');
  let cursor = path.resolve(outputRoot);
  for (const segment of segments.slice(0, -1)) {
    cursor = path.join(cursor, segment);
    const stat = lstatIfPresent(cursor);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(`Refusing an unsafe output directory: ${cursor}`);
      continue;
    }
    fs.mkdirSync(cursor);
  }
}

function resolveSafePath(outputRoot: string, relativePath: string) {
  const normalized = normalizeRelativePosixPath(relativePath, 'Output path');
  const root = path.resolve(outputRoot);
  const resolved = path.resolve(root, ...normalized.split('/'));
  if (!resolved.startsWith(`${root}${path.sep}`))
    throw new Error(`Output path escapes its root: ${relativePath}`);
  return resolved;
}

function uniqueSorted(paths: readonly string[]) {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function emptyOutputManifest(): PreviousOutputManifest {
  return {
    docs: [],
    images: [],
    schemaVersion: 'docs-tests.output-manifest/v1alpha1',
  };
}

function createContentHashes(root: string, paths: readonly string[]) {
  return Object.fromEntries(
    paths.map((relativePath) => [
      relativePath,
      fileHash(resolveSafePath(root, relativePath)),
    ]),
  );
}

function mergeContentHashes(
  priorPaths: readonly string[],
  priorHashes: Record<string, string> | undefined,
  generatedPaths: readonly string[],
  generatedHashes: Record<string, string>,
) {
  const merged: Record<string, string> = {};
  for (const relativePath of priorPaths) {
    const hash = priorHashes?.[relativePath];
    if (hash) merged[relativePath] = hash;
  }
  for (const relativePath of generatedPaths)
    merged[relativePath] = generatedHashes[relativePath];
  return merged;
}

function fileHash(filePath: string) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')}`;
}

function getTargetFingerprints(input: {
  docs: OutputTarget;
  images: OutputTarget;
}): OutputTargetFingerprints {
  return {
    docs: fingerprintOutputRoot(input.docs.outputRoot),
    images: fingerprintOutputRoot(input.images.outputRoot),
  };
}

function fingerprintOutputRoot(outputRoot: string) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(canonicalOutputRoot(outputRoot))
    .digest('hex')}`;
}

function hasMatchingTargetFingerprints(
  manifest: PreviousOutputManifest,
  targetFingerprints: OutputTargetFingerprints,
) {
  return (
    manifest.targetFingerprints?.docs === targetFingerprints.docs &&
    manifest.targetFingerprints?.images === targetFingerprints.images
  );
}

function hasManagedPaths(manifest: PreviousOutputManifest) {
  return manifest.docs.length > 0 || manifest.images.length > 0;
}

function retainOwnershipForMatchingRoots(
  manifest: PreviousOutputManifest,
  targetFingerprints: OutputTargetFingerprints,
): PreviousOutputManifest {
  const keepDocs =
    manifest.targetFingerprints?.docs === targetFingerprints.docs;
  const keepImages =
    manifest.targetFingerprints?.images === targetFingerprints.images;
  return {
    ...(keepDocs ? { docs: manifest.docs } : { docs: [] }),
    ...(keepImages ? { images: manifest.images } : { images: [] }),
    ...(keepDocs || keepImages
      ? {
          contentHashes: {
            docs: keepDocs ? manifest.contentHashes?.docs ?? {} : {},
            images: keepImages ? manifest.contentHashes?.images ?? {} : {},
          },
        }
      : {}),
    schemaVersion: 'docs-tests.output-manifest/v1alpha1',
  };
}

function lstatIfPresent(filePath: string) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function normalizeContentHashes(
  hashes: Record<string, string>,
  paths: readonly string[],
  label: string,
) {
  const normalized: Record<string, string> = {};
  const allowedPaths = new Set(paths);
  for (const [relativePath, hash] of Object.entries(hashes)) {
    const safePath = normalizeRelativePosixPath(relativePath, label);
    if (!allowedPaths.has(safePath))
      throw new Error(`${label} is not listed in the output manifest.`);
    normalized[safePath] = hash;
  }
  return normalized;
}

function sameOutputRoot(left: string, right: string) {
  return outputRootComparisonKey(left) === outputRootComparisonKey(right);
}

function canonicalOutputRoot(outputRoot: string) {
  return fs.realpathSync.native(path.resolve(outputRoot));
}

function outputRootComparisonKey(outputRoot: string) {
  const canonical = canonicalOutputRoot(outputRoot);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? canonical.toLocaleLowerCase('en-US')
    : canonical;
}
