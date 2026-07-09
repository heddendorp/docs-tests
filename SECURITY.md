# Security Policy

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
[private security advisory form](https://github.com/heddendorp/docs-tests/security/advisories/new)
with a minimal reproduction, affected version, and impact assessment.

Security reports involving output-path traversal, cleanup ownership,
symlink handling, package publishing, or screenshot redaction are especially
useful. The maintainer will acknowledge the report and coordinate a fix before
public disclosure where practical.

## Supported Versions

Security fixes are applied to the latest released `0.x` version. Consumers
should keep `docs-tests`, Playwright, and Node.js within their supported release
lines.
