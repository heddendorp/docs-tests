import path from 'node:path';

import type {
  DocumentationAsset,
  DocumentationBlock,
  SourceTestReference,
  TestGroupDocument,
  TestSection,
} from './shared.js';

export type DocsBundle = {
  assets: DocumentationAsset[];
  guides: BundleGuide[];
  schemaVersion: 'docs-tests.bundle/v1alpha1';
};

export type BundleGuide = {
  id: string;
  metadata: {
    frontmatter?: Record<string, unknown>;
    order?: number;
    permissions?: readonly { description?: string; label: string; required?: boolean }[];
    tags?: readonly string[];
  };
  sections: BundleSection[];
  slug: string;
  title: string;
};

export type BundleSection = {
  blocks: DocumentationBlock[];
  source: SourceTestReference;
  title: string;
};

export function renderDocument(input: {
  document: TestGroupDocument;
  imagePublicPath?: string;
}): { bundleGuide: BundleGuide; page: string } {
  const sections = [...input.document.sections].sort(compareSections);
  const title =
    input.document.guide?.title ??
    input.document.describeTitle ??
    (sections.length > 1
      ? titleFromFolderName(input.document.folderName)
      : sections[0].title);
  const guide = input.document.guide;
  const leadingBlocks: DocumentationBlock[] = guide?.permissions?.length
    ? [{ permissions: [...guide.permissions], type: 'permissions' }]
    : [];
  const bundleGuide: BundleGuide = {
    id: guide?.id ?? `legacy:${input.document.folderName}`,
    metadata: {
      ...(guide?.frontmatter ? { frontmatter: guide.frontmatter } : {}),
      ...(guide?.order === undefined ? {} : { order: guide.order }),
      ...(guide?.permissions?.length ? { permissions: guide.permissions } : {}),
      ...(guide?.tags?.length ? { tags: guide.tags } : {}),
    },
    sections: sections.map((section) => ({
      blocks: section.blocks,
      source: normalizeSourceReference(section.source),
      title: section.title,
    })),
    slug: input.document.folderName,
    title,
  };

  const pageLines = [`---\ntitle: ${JSON.stringify(title)}\n---`];
  if (leadingBlocks.length > 0)
    pageLines.push('', ...renderBlocks(leadingBlocks, input.imagePublicPath));

  for (const [index, section] of sections.entries()) {
    if (pageLines.length > 1 || index > 0) pageLines.push('');
    if (sections.length > 1) pageLines.push(`## ${toSingleLine(section.title)}`);
    pageLines.push(...renderBlocks(section.blocks, input.imagePublicPath));
  }

  return { bundleGuide, page: pageLines.join('\n').replace(/\n{3,}/g, '\n\n') };
}

export function createBundle(guides: readonly BundleGuide[]): DocsBundle {
  const assets = new Map<string, DocumentationAsset>();
  for (const guide of guides) {
    for (const section of guide.sections) {
      for (const block of section.blocks) {
        if (block.type !== 'image') continue;
        const existing = assets.get(block.asset.id);
        if (
          existing &&
          JSON.stringify(existing) !== JSON.stringify(block.asset)
        )
          throw new Error(`Conflicting asset metadata for "${block.asset.id}".`);
        assets.set(block.asset.id, block.asset);
      }
    }
  }

  return {
    assets: [...assets.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    guides: [...guides].sort((left, right) => {
      const leftOrder = left.metadata.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.metadata.order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.slug.localeCompare(right.slug);
    }),
    schemaVersion: 'docs-tests.bundle/v1alpha1',
  };
}

function compareSections(left: TestSection, right: TestSection) {
  if (left.line !== right.line) return left.line - right.line;
  return left.title.localeCompare(right.title);
}

function renderBlocks(
  blocks: readonly DocumentationBlock[],
  imagePublicPath?: string,
) {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === 'markdown') {
      lines.push(block.markdown);
      continue;
    }

    if (block.type === 'permissions') {
      lines.push('> **Required permissions**', '>');
      for (const permission of block.permissions) {
        const description = permission.description
          ? `: ${toSingleLine(permission.description)}`
          : '';
        lines.push(`> - ${toSingleLine(permission.label)}${description}`);
      }
      continue;
    }

    const imagePath = imagePublicPath
      ? `${imagePublicPath.replace(/\/+$/g, '')}/${block.asset.outputPath}`
      : `./${path.posix.basename(block.asset.outputPath)}`;
    lines.push(`![${escapeAlt(block.alt)}](${imagePath})`);
    if (block.caption) lines.push(`*${escapeEmphasis(block.caption)}*`);
  }
  return lines;
}

function normalizeSourceReference(source: SourceTestReference) {
  const normalizedFile = source.file ? relativeSourcePath(source.file) : undefined;
  const titlePath = source.titlePath
    ?.map(toSingleLine)
    .filter((part) => part && !isAbsoluteSourcePath(part));
  return {
    ...(normalizedFile ? { file: normalizedFile } : {}),
    ...(source.line === undefined ? {} : { line: source.line }),
    ...(titlePath?.length
      ? { titlePath }
      : {}),
  };
}

function isAbsoluteSourcePath(value: string) {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

function relativeSourcePath(filePath: string) {
  const relative = path.relative(process.cwd(), filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep).join('/');
}

function titleFromFolderName(folderName: string) {
  return folderName
    .split('/')
    .at(-1)!
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeAlt(value: string) {
  return toSingleLine(value).replace(/[\[\]]/g, '\\$&');
}

function escapeEmphasis(value: string) {
  return toSingleLine(value).replace(/\*/g, '\\*');
}

function toSingleLine(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}
