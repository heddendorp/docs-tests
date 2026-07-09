# Product Context

Docs Tests is a portable starter project for generating product documentation
from Playwright journeys.

The product idea is simple: the same browser flow that verifies a workflow
should also produce the guide that explains that workflow. A documented flow is
not complete until it can be executed against the app and regenerated from the
current UI.

## Product Goal

Give a new application a lightweight documentation-testing system that can:

- verify important user and admin workflows
- generate Markdown documentation from those verified workflows
- capture screenshots from real app states
- keep documentation close to the behavior it describes
- publish generated docs into any static docs app or content repository

## Users

Primary users:

- product engineers who maintain Playwright tests
- technical writers or product owners who review generated docs
- support/admin teams who need current workflow guides
- future agents that need executable evidence for product behavior

Readers of the generated documentation may be:

- end users learning workflows
- admins configuring a product
- internal operators following support procedures
- developers reviewing product behavior

## Core Workflow

1. A documentation spec opens a real app route.
2. The spec performs the same actions a user would perform.
3. Assertions prove the documented behavior is still true.
4. The spec attaches Markdown explanation at the right moments.
5. The spec captures screenshots from stable UI states.
6. The documentation reporter writes one portable Markdown page per guide and
   a versioned artifact bundle for structured consumers.
7. A publish command points the output at a docs site or content repository.

## Product Principles

- **Executable docs over screenshots-only docs**: guides should come from
  journeys that can fail when the product changes.
- **Behavior first**: assert the claim before documenting it.
- **Feature-area organization**: group guides by the surface users are trying to
  use, not only by persona.
- **Portable by default**: no dependency on a specific frontend framework,
  database, auth provider, or docs renderer; default Markdown contains no
  renderer-specific directives.
- **Safe generated output**: generated-file cleanup must prove ownership and
  must not overwrite or delete hand-authored material.
- **Privacy-aware screenshots**: sensitive UI can be masked with documented
  redaction reasons instead of relying on post-processing.
- **Draft and publish modes**: local generation should be cheap and ignored;
  publishing should be explicit.
- **Useful failure evidence**: docs tests should keep traces on retry so broken
  guides are debuggable.

## Non-Goals

- This project is not a full documentation website.
- This project does not choose a specific auth provider.
- This project does not prescribe a database seeding strategy.
- This project does not replace unit, integration, or normal Playwright
  regression tests.

## Success Criteria

A consuming app has adopted the idea when:

- it has at least one `tests/docs/**/*.doc.ts` guide
- docs tests can run independently from the broader e2e suite
- generated Markdown and screenshots are reviewed before publishing
- important workflow changes update the relevant documentation spec
- CI can detect documentation drift when generated output is committed
