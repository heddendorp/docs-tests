# Quality

Documentation tests should be held to the same bar as product tests because the
generated guide is only useful when the represented behavior is true.

## Done Criteria for a Documentation Flow

A docs flow is ready when:

- it follows a real user/admin path
- it asserts each behavior that the guide claims
- it uses stable user-facing locators where possible
- it avoids fuzzy data discovery
- screenshots are captured only after stable UI states
- generated Markdown reads like product documentation, not a test log
- traces are available on retry for debugging

## Determinism

Prefer deterministic test data over finding whatever happens to exist in the
app.

Good inputs:

- seeded entities with stable handles
- fixed dates or clocks for time-sensitive flows
- explicit test users or roles
- API/database setup owned by the test project

Avoid:

- selecting the first random entity in a list
- relying on current wall-clock dates
- depending on manually prepared local state
- documenting hidden routes that users cannot reach through the UI

## Screenshot Guidance

Screenshots should support the reader. Capture only moments where the visual
state clarifies the workflow.

Prefer:

- page or panel states after data has loaded
- forms with representative fields
- confirmation/success states
- permission or unavailable states when they matter

Avoid:

- loading spinners
- transient hover/focus states unless they are the subject
- screenshots with test/debug UI visible
- redundant screenshots that do not teach anything new

## CI Guidance

Recommended CI jobs:

- `npm run typecheck`
- `npm run docs:list`
- `npm run docs:test`
- optional generated-docs drift check when docs output is committed

If generated docs are committed, run the docs tests and fail the job when
`git diff --exit-code` shows stale output.

## Review Guidance

Review both dimensions:

- the Playwright flow protects meaningful behavior
- the generated document is readable for the intended audience

Do not accept a docs test that only screenshots a page without assertions.
