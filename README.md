# Docs Tests

Docs Tests generates user/admin documentation from Playwright journeys. The same
flow that verifies a product workflow can attach Markdown, screenshots, and
permission notes that a custom reporter compiles into portable Markdown and a
versioned documentation artifact.

Requires Node.js 24 or later and Playwright `>=1.61.0 <2`.

Read the project context first:

- [PRODUCT.md](./PRODUCT.md) explains what this project is for.
- [CONCEPT.md](./CONCEPT.md) explains the executable-docs idea.
- [ARCHITECTURE.md](./ARCHITECTURE.md) explains the moving parts.
- [QUALITY.md](./QUALITY.md) explains what good docs tests look like.

## Install in Another Project

```bash
npm install --save-dev docs-tests @playwright/test
npx playwright install
```

Copy the starter files from `templates/basic` into the consuming app, or use the
same imports in an existing Playwright project:

```ts
import { attachGuide, attachMarkdown, takeDocScreenshot } from 'docs-tests';
import { expect, test } from 'docs-tests/test';
```

Add the documentation reporter to `playwright.config.ts`:

```ts
export default defineConfig({
  reporter: [['html', { open: 'never' }], ['dot'], ['docs-tests/reporter']],
});
```

## Develop This Package

```bash
npm install
npm run playwright:install
```

Useful local checks:

```bash
npm run typecheck
npm test
npm run build
npm run docs:list
npm run package:check
npm run package:smoke
```

## Run the Example

```bash
npm run docs:test
```

Default output:

- Markdown pages: `generated-docs/<guide-slug>/page.md`
- Images: `generated-docs/<guide-slug>/*.png`
- Artifact bundle: `generated-docs/docs-tests.bundle.json`
- Generated-file ownership manifest: `generated-docs/.docs-tests-manifest.json`
- Playwright HTML report: `playwright-report`

## Generate Docs for Another App

```bash
DOCS_OUT_DIR=/path/to/docs/content \
DOCS_IMG_OUT_DIR=/path/to/docs/public/docs \
DOCS_IMAGE_PUBLIC_PATH=/docs \
npm run docs:test
```

`DOCS_IMAGE_PUBLIC_PATH` controls the image URLs written into Markdown. If the
images live beside `page.md`, omit it.

## Output Safety

The reporter stages attachments and writes final files only when the complete
Playwright run passes. Existing output is preserved by default. It refuses to
overwrite unowned files and does not prune files it cannot prove it generated.

For a complete, unfiltered docs run, manifest-owned cleanup can remove stale
files from the previous generated output:

```ts
export default defineConfig({
  reporter: [
    ['docs-tests/reporter', { clean: 'manifest-owned', fullRun: true }],
  ],
});
```

`fullRun: true` is a deliberate assertion that this command covers the whole
documentation suite. Publishing is refused for filters, targeted test files,
`--only-changed`, failed-test reruns, and shards. Cleanup only removes paths
from a matching previous manifest whose bytes still match the recorded SHA-256
hash. Use it only in a dedicated full-run command. Publishing replaces
individual files atomically; it does not claim an atomic transaction across two
arbitrary output roots.

## Public API

- `docs-tests`: exports `attachGuide`, `attachMarkdown`, `attachPermissions`,
  `takeDocScreenshot`, `takeScreenshot`, and the corresponding public metadata
  and screenshot option types.
- `takeScreenshot(testInfo, locator, page, caption?)` is a compatibility alias
  for existing Evorto-style guides and is also exported from
  `docs-tests/reporter`.
- `docs-tests/test`: re-exports Playwright `test` and `expect`.
- `docs-tests/reporter`: default Playwright reporter that writes generated docs.
- `docs-tests/markdown` and `docs-tests/screenshot`: focused helper subpaths.

Use explicit guide metadata for stable identity and routing. The older
`test.describe(...)` grouping remains a compatibility fallback. Attach the same
guide metadata in every test that contributes a section to that guide; a
`test.beforeEach` hook is convenient for shared metadata.

```ts
await attachGuide(testInfo, {
  id: 'billing-overview',
  slug: 'guides/billing/overview',
  title: 'Manage billing',
  tags: ['billing'],
});

await attachMarkdown(testInfo, 'Review invoices before exporting.');
await takeDocScreenshot(testInfo, page, page.getByRole('main'), {
  alt: 'Billing overview',
  caption: 'Review invoices before exporting.',
  fullPage: true,
  redactions: [
    { locator: page.getByText(/customer@example\.com/), reason: 'Customer email' },
  ],
});
```

The default renderer emits standard Markdown only. `docs-tests.bundle/v1alpha1`
contains guide metadata, source references, asset hashes, and redaction reasons
for consumers that need structured data. The artifact and attachment envelopes
are alpha contracts during `0.x`.

## Optional App Startup

Set `DOCS_WEB_SERVER_COMMAND` if Playwright should start the app:

```bash
DOCS_BASE_URL=http://localhost:3000 \
DOCS_WEB_SERVER_COMMAND="npm run dev -- --port 3000" \
npm run docs:test
```

If the app is already running, omit `DOCS_WEB_SERVER_COMMAND`.

## Optional Login

`tests/setup/auth.setup.ts` writes `.auth/docs-user.json`.

Configure these only when the docs flow needs authentication:

```bash
DOCS_LOGIN_URL=/login \
DOCS_AUTH_USERNAME=user@example.com \
DOCS_AUTH_PASSWORD=secret \
npm run docs:test
```

Edit the selectors in `tests/setup/auth.setup.ts` to match the new app.

## First Porting Checklist

1. Replace the example guide in `tests/docs/getting-started.doc.ts`.
2. Adapt `tests/setup/auth.setup.ts` if the app requires login.
3. Add deterministic test data setup for the first real product workflow.
4. Run `npm run typecheck`, `npm test`, and `npm run docs:list`.
5. Run `npm run docs:test` against the app.
6. Point `DOCS_OUT_DIR` and `DOCS_IMG_OUT_DIR` at the target docs app.
7. Run `npm run package:smoke` before publishing a package change.

## Release Management

Knope Bot manages versioning, changelog entries, and GitHub release pull
requests through [`knope.toml`](./knope.toml). Install
[Knope Bot](https://github.com/marketplace/knope-bot) for only this repository
to enable it. A documented change is either a Knope change file or a
Conventional Commit; Knope Bot then maintains a `knope/release` pull request.
Merging that pull request creates the GitHub release and runs
[`publish.yml`](./.github/workflows/publish.yml).

The publish workflow uses npm Trusted Publishing rather than a long-lived npm
token. The package is MIT licensed. Before enabling the first automated
release, make the repository public, publish the initial `0.1.0` release, and
configure npm Trusted Publishing for `heddendorp/docs-tests`,
`.github/workflows/publish.yml`, and the `npm-publish` environment. Require the
Knope and Package checks before merging to `main`.

After the initial publish, npm 11.5.1 or later can configure the trusted
publisher. Check or upgrade the npm CLI in the active Node installation first:

```bash
npm --version
npm install --global npm@^11.15.0 # Only needed when npm is older than 11.5.1.
```

Then configure the trusted publisher:

```bash
npm trust github docs-tests \
  --file publish.yml \
  --repo heddendorp/docs-tests \
  --env npm-publish \
  --allow-publish
```

## Bootstrap Publishing

The MIT license is included. The current package name, `docs-tests`, was not
present on the public npm registry when this repository was prepared; verify
availability again immediately before publishing.

```bash
npm run typecheck
npm run build
npm run package:check
npm run package:smoke
npm publish --access public
```

The package uses Playwright's documented custom reporter, project dependency,
and storage-state authentication patterns. npm packaging follows the documented
`package.json` fields, `exports`, `files`, and `npm publish` flow.
