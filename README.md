# Portable Playwright Documentation Project

This is a standalone template for generating user/admin documentation from
Playwright journeys.

Read the project context first:

- [PRODUCT.md](./PRODUCT.md) explains what this project is for.
- [CONCEPT.md](./CONCEPT.md) explains the executable-docs idea.
- [ARCHITECTURE.md](./ARCHITECTURE.md) explains the moving parts.
- [QUALITY.md](./QUALITY.md) explains what good docs tests look like.

## Install

```bash
npm install
npm run playwright:install
```

## Run

```bash
npm run docs:test
```

Default output:

- Markdown pages: `generated-docs/<guide-slug>/page.md`
- Images: `generated-docs/<guide-slug>/*.png`
- Playwright HTML report: `playwright-report`

## Publish to Another Docs App

```bash
DOCS_OUT_DIR=/path/to/docs/content \
DOCS_IMG_OUT_DIR=/path/to/docs/public/docs \
DOCS_IMAGE_PUBLIC_PATH=/docs \
npm run docs:test
```

`DOCS_IMAGE_PUBLIC_PATH` controls the image URLs written into Markdown. If the
images live beside `page.md`, omit it.

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
