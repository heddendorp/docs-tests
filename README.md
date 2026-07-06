# Docs Tests

Docs Tests generates user/admin documentation from Playwright journeys. The same
flow that verifies a product workflow can attach Markdown, screenshots, and
permission notes that a custom reporter writes to static docs content.

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
import { attachMarkdown, takeDocScreenshot } from 'docs-tests';
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
npm run build
npm run docs:list
npm run package:check
```

## Run the Example

```bash
npm run docs:test
```

Default output:

- Markdown pages: `generated-docs/<guide-slug>/page.md`
- Images: `generated-docs/<guide-slug>/*.png`
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

## Public API

- `docs-tests`: exports `attachMarkdown`, `attachPermissions`, and
  `takeDocScreenshot`.
- `docs-tests/test`: re-exports Playwright `test` and `expect`.
- `docs-tests/reporter`: default Playwright reporter that writes generated docs.
- `docs-tests/markdown` and `docs-tests/screenshot`: focused helper subpaths.

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
4. Run `npm run typecheck` and `npm run docs:list`.
5. Run `npm run docs:test` against the app.
6. Point `DOCS_OUT_DIR` and `DOCS_IMG_OUT_DIR` at the target docs app.

## Publish to npmjs

Before publishing, choose the final package name and license. The current
package name, `docs-tests`, was not present on the public npm registry during
the latest readiness check.

```bash
npm run typecheck
npm run build
npm run package:check
npm publish --access public
```

The package uses Playwright's documented custom reporter, project dependency,
and storage-state authentication patterns. npm packaging follows the documented
`package.json` fields, `exports`, `files`, and `npm publish` flow.
