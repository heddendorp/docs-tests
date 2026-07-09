export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PermissionNote = {
  description?: string;
  label: string;
  required?: boolean;
};

export type GuideMetadata = {
  frontmatter?: Record<string, JsonValue>;
  id: string;
  order?: number;
  permissions?: readonly PermissionNote[];
  slug: string;
  tags?: readonly string[];
  title: string;
};

export type Caption = {
  alt?: string;
  text: string;
};

const WINDOWS_RESERVED_NAMES = new Set([
  'aux',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'con',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
  'nul',
]);

export function normalizeRelativePosixPath(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized)
    throw new Error(`${label} must be a non-empty relative POSIX path.`);
  if (normalized.includes('\\') || normalized.startsWith('/'))
    throw new Error(`${label} must be a relative POSIX path.`);

  const segments = normalized.split('/');
  for (const segment of segments) {
    if (
      !segment ||
      segment === '.' ||
      segment === '..' ||
      segment.endsWith('.') ||
      segment.endsWith(' ') ||
      !/^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*|\.[a-zA-Z0-9][a-zA-Z0-9._-]*)$/.test(
        segment,
      ) ||
      WINDOWS_RESERVED_NAMES.has(segment.toLowerCase())
    )
      throw new Error(`${label} contains an unsafe path segment: "${segment}".`);
  }

  return segments.join('/');
}

export function normalizePermissionNote(
  permission: string | PermissionNote,
): PermissionNote {
  if (typeof permission === 'string') {
    const label = permission.trim();
    if (!label) throw new Error('Permission labels must not be blank.');
    return { label };
  }

  const label = permission.label.trim();
  if (!label) throw new Error('Permission labels must not be blank.');
  const description = permission.description?.trim();
  return {
    ...(description ? { description } : {}),
    label,
    ...(permission.required === undefined ? {} : { required: permission.required }),
  };
}

export function normalizeCaption(caption: string | Caption): Caption {
  if (typeof caption === 'string') {
    const text = caption.trim();
    if (!text) throw new Error('Image captions must not be blank.');
    return { text };
  }

  const text = caption.text.trim();
  if (!text) throw new Error('Image captions must not be blank.');
  const alt = caption.alt?.trim();
  return { ...(alt ? { alt } : {}), text };
}

export function normalizeGuideMetadata(metadata: GuideMetadata): GuideMetadata {
  const id = metadata.id.trim();
  const title = metadata.title.trim();
  if (!id) throw new Error('Guide metadata requires a non-empty id.');
  if (!title) throw new Error('Guide metadata requires a non-empty title.');
  if (metadata.order !== undefined && !Number.isFinite(metadata.order))
    throw new Error('Guide metadata order must be a finite number.');

  const tags = metadata.tags
    ?.map((tag) => tag.trim())
    .filter(Boolean);
  const permissions = metadata.permissions?.map(normalizePermissionNote);

  return {
    ...(metadata.frontmatter
      ? { frontmatter: cloneJsonObject(metadata.frontmatter, 'frontmatter') }
      : {}),
    id,
    ...(metadata.order === undefined ? {} : { order: metadata.order }),
    ...(permissions?.length ? { permissions } : {}),
    slug: normalizeRelativePosixPath(metadata.slug, 'Guide metadata slug'),
    ...(tags?.length ? { tags } : {}),
    title,
  };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('JSON metadata numbers must be finite.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!value || typeof value !== 'object')
    throw new Error('Metadata must contain only JSON-compatible values.');

  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      const child = (value as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${canonicalJson(child)}`;
    })
    .join(',')}}`;
}

function cloneJsonObject(value: Record<string, JsonValue>, label: string) {
  try {
    return JSON.parse(canonicalJson(value)) as Record<string, JsonValue>;
  } catch {
    throw new Error(`${label} must contain only JSON-compatible values.`);
  }
}
