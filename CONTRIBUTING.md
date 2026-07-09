# Contributing

## Before Opening a Pull Request

Run the local package checks:

```bash
npm run typecheck
npm test
npm run build
npm run docs:list
npm run package:check
npm run package:smoke
```

Use a Conventional Commit or add a Knope change file so Knope Bot can verify
the change and prepare the next release.

## Compatibility During 0.x

The public helper signatures and reporter options are treated as user-facing
contracts. Versioned artifact schemas such as `docs-tests.bundle/v1alpha1` and
attachment envelopes remain alpha: changes must be documented, validated in
the fixture tests, and released in a minor version when they require consumer
changes.

Do not add renderer-specific syntax to the default Markdown output. Keep
renderer integrations outside the core artifact contract until there is a
documented compatibility policy for them.

## Safety-Sensitive Changes

Changes to output cleanup, path handling, screenshot masking/redaction,
artifact schemas, or release workflows require focused regression coverage.
The generated-file manifest is deliberately conservative: it must never claim
ownership of an unverified user file.
